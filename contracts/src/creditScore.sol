// SPDX-License-Identifier: MIT
pragma solidity >=0.8.2 <0.9.0;

import {EvmV1Decoder} from "./vendored/EvmV1Decoder.sol";
import {ASCBase} from "./vendored/ASCBase.sol";
import {ScoreCalculateLib} from "./ScoreCalculateLib.sol";

contract OnChainCreditScore is ASCBase {
    uint16 public constant MIN_SCORE = 400;
    uint16 public constant MAX_SCORE = 900;
    uint16 public constant DEFAULT_SCORE = 600;

    uint64 public constant ETH_MAINNET_KEY = 3;
    uint64 public constant SEPOLIA_KEY = 1;

    address public constant AAVE_V3_POOL =
        0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2;
    address public constant COMET_USDC =
        0xc3d688B66703497DAA19211EEdff47f25384cdc3;
    address public constant COMET_USDT =
        0x3Afdc9BCA9213A35503b077a6072F3D0d5AB0840;
    address public constant SPARK_POOL =
        0xC13e21B648A5Ee794902342038FF3aDAB66BE987;
    address public constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    address public constant USDT = 0xdAC17F958D2ee523a2206206994597C13D831ec7;
    address public constant DAI = 0x6B175474E89094C44Da98b954EedeAC495271d0F;
    address public constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address public constant WBTC = 0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599;

    uint8 public constant VENUE_AAVE = 1;
    uint8 public constant VENUE_SPARK = 2;
    uint8 public constant VENUE_COMPOUND = 4;

    uint256 public constant CAP_SILVER = 100e18;
    uint256 public constant CAP_PLATINUM = 1_000e18;
    uint256 public constant MAX_PRICE_USD18 = 1_000_000e18;
    // Default severity lines (USD): dust stings, mid bites, large hits like before.
    uint256 public constant SMALL_DEFAULT_MAX = 50e18;
    uint256 public constant MID_DEFAULT_MAX = 1_000e18;
    uint16 public constant PENALTY_SMALL = 20;
    uint16 public constant PENALTY_MID = 60;
    uint16 public constant PENALTY_LARGE = 120;

    address public immutable loanFacility;

    bytes32 public constant AAVE_REPAY =
        keccak256("Repay(address,address,address,uint256,bool)");
    bytes32 public constant AAVE_LIQ =
        keccak256("LiquidationCall(address,address,address,uint256,uint256,address,bool)");
    bytes32 public constant AAVE_BORROW =
        keccak256("Borrow(address,address,address,uint256,uint8,uint256,uint16)");
    bytes32 public constant COMPOUND_SUPPLY =
        keccak256("Supply(address,address,uint256)");
    bytes32 public constant COMPOUND_ABSORB =
        keccak256("AbsorbCollateral(address,address,address,uint256,uint256)");
    bytes32 public constant COMPOUND_WITHDRAW =
        keccak256("Withdraw(address,address,uint256)");
    bytes32 public constant FACILITY_REPAY =
        keccak256("LoanRepaid(uint256,address,uint256,uint256)");
    bytes32 public constant FACILITY_DEFAULT =
        keccak256("LoanDefaulted(uint256,address,uint256)");

    enum SourceKind {
        None,
        AaveV3,
        Compound,
        SparkLend,
        LoanFacility
    }

    enum Tier {
        Bronze,
        Silver,
        Gold,
        Platinum
    }

    /// @notice A source chain's block-height-to-time reference.
    struct ChainAnchor {
        uint64 height;
        uint64 timestamp;
        uint32 secondsPerBlock;
    }

    struct Parsed {
        address repayUser;
        address liqUser;
        address repayToken;
        address repayEmitter;
        uint256 repayRaw;
        address borrowEmitter;
        address borrowToken;
        address borrowUser;
        uint256 liqSeverity18;
        uint256 hit;
        uint8 repayVenue;
        bool defiRepay;
    }

    struct CreditProfile {
        uint16 score;
        bool isInitialized;
        uint256 capacity18;
        uint256 maxRepayment18;
        uint16 defaults;
        uint8 venues;
        // INTREST  1800 = 18.00% APR
        uint16 interestBps;
        // Earliest proven source-chain activity. The age axis; scoring term pending.
        uint64 oldestActivity;
    }

    mapping(address => CreditProfile) internal _profiles;
    mapping(uint64 => mapping(address => SourceKind)) public sources;
    mapping(address => uint8) public tokenDecimals;
    // USD value of 1 whole token, scaled 1e18. Owner-pushed (no Chainlink on Creditcoin).
    mapping(address => uint256) public priceUSD18;
    // Comet emitter -> its base loan token. One Comet = one base asset.
    mapping(address => address) public cometBaseToken;
    // Source-chain height -> wall-clock anchors. Proofs cover height, not time.
    mapping(uint64 => ChainAnchor) public chainAnchors;

    address public owner;
    bool public paused;

    event ScoreIncreased(address indexed user, uint16 newScore, uint16 gained);
    event ScoreDecreased(address indexed user, uint16 newScore);
    event FlashLoanIgnored(address indexed user);
    event DustRepayIgnored(address indexed user, uint256 amount18);
    event CapacityAdded(address indexed user, uint256 amount18, uint256 capacity18, uint8 venues);
    event DefaultRecorded(address indexed user, uint16 defaults);
    event Paused(address indexed by);
    event Unpaused(address indexed by);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event PriceSet(address indexed reserve, uint256 priceUSD18);
    event ReserveRegistered(address indexed reserve, uint8 decimals);
    event ChainAnchorRegistered(uint64 indexed chainKey, uint64 height, uint64 timestamp, uint32 secondsPerBlock);
    // INTREST
    event InterestUpdated(address indexed user, uint16 interestBps);

    error UnknownAction(uint8 action);
    error UnsupportedTransactionType(uint8 txType);
    error SourceTransactionFailed(uint8 receiptStatus);
    error NoRecognisedEvents();
    error ShortTopics();
    error ZeroAddress();
    error UnknownReserve(address reserve);
    error UnknownPrice(address reserve);
    error InvalidAnchor();
    error FixedPrice(address reserve);
    error ZeroPrice();
    error PriceTooHigh(uint256 price, uint256 maximum);
    error NotOwner();
    error EnforcedPause();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert EnforcedPause();
        _;
    }

    constructor(address facility) {
        if (facility == address(0)) revert ZeroAddress();
        owner = msg.sender;
        loanFacility = facility;

        sources[ETH_MAINNET_KEY][AAVE_V3_POOL] = SourceKind.AaveV3;
        sources[ETH_MAINNET_KEY][COMET_USDC] = SourceKind.Compound;
        sources[ETH_MAINNET_KEY][COMET_USDT] = SourceKind.Compound;
        sources[ETH_MAINNET_KEY][SPARK_POOL] = SourceKind.SparkLend;
        sources[SEPOLIA_KEY][facility] = SourceKind.LoanFacility;
        cometBaseToken[COMET_USDC] = USDC;
        cometBaseToken[COMET_USDT] = USDT;

        tokenDecimals[USDC] = 6;
        tokenDecimals[USDT] = 6;
        tokenDecimals[DAI] = 18;
        tokenDecimals[WETH] = 18;
        tokenDecimals[WBTC] = 8;

        // Base case $1 for all; owner must push real prices for WETH/WBTC.
        priceUSD18[USDC] = 1e18;
        priceUSD18[USDT] = 1e18;
        priceUSD18[DAI] = 1e18;
        priceUSD18[WETH] = 1e18;
        priceUSD18[WBTC] = 1e18;
    }

    function pause() external onlyOwner {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    /// @notice Hands ownership (prices, markets, pause) to a multisig. One way per call.
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /// @notice Push USD price of 1 whole token, scaled 1e18 (e.g. WETH = 3000e18).
    /// @dev USDC/USDT are fixed at $1. Zero and absurd values revert.
    function setPrice(address reserve, uint256 price) external onlyOwner {
        if (reserve == address(0)) revert ZeroAddress();
        if (reserve == USDC || reserve == USDT) revert FixedPrice(reserve);
        if (price == 0) revert ZeroPrice();
        if (price > MAX_PRICE_USD18) revert PriceTooHigh(price, MAX_PRICE_USD18);
        priceUSD18[reserve] = price;
        emit PriceSet(reserve, price);
    }

    /// @notice Register a token's decimals so its repayments can be normalised.
    function registerReserve(address reserve, uint8 decimals) external onlyOwner {
        if (reserve == address(0)) revert ZeroAddress();
        tokenDecimals[reserve] = decimals;
        emit ReserveRegistered(reserve, decimals);
    }

    /// @notice Anchor a source chain's height to wall-clock time for the age axis.
    function registerChainAnchor(uint64 chainKey, uint64 height, uint64 timestamp, uint32 secondsPerBlock)
        external
        onlyOwner
    {
        if (timestamp == 0 || secondsPerBlock == 0) revert InvalidAnchor();
        chainAnchors[chainKey] = ChainAnchor(height, timestamp, secondsPerBlock);
        emit ChainAnchorRegistered(chainKey, height, timestamp, secondsPerBlock);
    }

    function getScore(address user) public view returns (uint16) {
        if (!_profiles[user].isInitialized) return DEFAULT_SCORE;
        return _profiles[user].score;
    }

    function getCapacity(address user) public view returns (uint256) {
        return _profiles[user].capacity18;
    }

    function getMaxRepayment(address user) public view returns (uint256) {
        return _profiles[user].maxRepayment18;
    }

    function getOldestActivity(address user) public view returns (uint64) {
        return _profiles[user].oldestActivity;
    }

    function getVenues(address user) public view returns (uint8) {
        return _profiles[user].venues;
    }

    function getDefaults(address user) public view returns (uint16) {
        return _profiles[user].defaults;
    }

    function getTier(address user) public view returns (Tier) {
        return _tierOf(_profiles[user]);
    }

    function getCollateralBps(address user) public view returns (uint32) {
        return _bpsForTier(_tierOf(_profiles[user]));
    }

    // INTREST frontend
    function getInterestBps(address user) public view returns (uint16) {
        CreditProfile memory p = _profiles[user];
        if (!p.isInitialized) return _interestFor(Tier.Bronze, 0);
        return _interestFor(_tierOf(p), p.defaults);
    }

    // INTREST frontend
    function getInterestPercent(address user) external view returns (uint16) {
        return getInterestBps(user) / 100;
    }

    function previewCredit(address user)
        external
        view
        returns (
            uint16 score,
            uint256 capacity18,
            uint256 maxRepayment18,
            uint64 oldestActivity,
            uint8 venues,
            uint16 venueCount,
            uint16 defaults,
            Tier tier,
            uint32 collateralBps,
            uint16 collateralPercent,
            uint16 interestBps,
            uint16 interestPercent
        )
    {
        CreditProfile memory p = _profiles[user];
        score = p.isInitialized ? p.score : DEFAULT_SCORE;
        capacity18 = p.capacity18;
        maxRepayment18 = p.maxRepayment18;
        oldestActivity = p.oldestActivity;
        venues = p.venues;
        venueCount = _venueCount(p.venues);
        defaults = p.defaults;
        tier = _tierOf(p);
        collateralBps = _bpsForTier(tier);
        collateralPercent = uint16(collateralBps / 100);
        // INTREST
        interestBps = _interestFor(tier, defaults);
        interestPercent = interestBps / 100;
    }

    function increaseScore(address user, uint256 amount18) internal {
        if (ScoreCalculateLib.getPoints(amount18) == 0) {
            emit DustRepayIgnored(user, amount18);
            return;
        }
        _initializeIfNeeded(user);
        (uint16 newScore, uint16 gained) =
            ScoreCalculateLib.applyIncrease(_profiles[user].score, MAX_SCORE, amount18);
        _profiles[user].score = newScore;
        _syncInterest(user);
        emit ScoreIncreased(user, newScore, gained);
    }

    function decreaseScore(address user, uint256 severity18) internal {
        _initializeIfNeeded(user);
        uint16 currentScore = _profiles[user].score;
        uint16 penalty = _defaultPenalty(severity18);
        uint16 newScore = currentScore <= MIN_SCORE + penalty ? MIN_SCORE : currentScore - penalty;
        _profiles[user].score = newScore;
        // Saturate: bricking one griefed address must never brick ingests.
        if (_profiles[user].defaults < type(uint16).max) _profiles[user].defaults += 1;
        emit ScoreDecreased(user, newScore);
        emit DefaultRecorded(user, _profiles[user].defaults);
        _syncInterest(user);
    }

    function _defaultPenalty(uint256 severity18) private pure returns (uint16) {
        if (severity18 <= SMALL_DEFAULT_MAX) return PENALTY_SMALL;
        if (severity18 <= MID_DEFAULT_MAX) return PENALTY_MID;
        return PENALTY_LARGE;
    }

    function _initializeIfNeeded(address user) internal {
        if (!_profiles[user].isInitialized) {
            _profiles[user].score = DEFAULT_SCORE;
            _profiles[user].isInitialized = true;
            // INTREST
            _profiles[user].interestBps = _interestFor(Tier.Bronze, 0);
        }
    }

    function _addr(bytes32 topic) private pure returns (address) {
        return address(uint160(uint256(topic)));
    }

    function _value18(address token, uint256 raw) internal view returns (uint256) {
        uint8 d = tokenDecimals[token];
        if (d == 0) revert UnknownReserve(token);
        uint256 price = priceUSD18[token];
        if (price == 0) revert UnknownPrice(token);
        return (ScoreCalculateLib.normalise(raw, d) * price) / 1e18;
    }

    function _venueBit(SourceKind kind) private pure returns (uint8) {
        if (kind == SourceKind.AaveV3) return VENUE_AAVE;
        if (kind == SourceKind.SparkLend) return VENUE_SPARK;
        if (kind == SourceKind.Compound) return VENUE_COMPOUND;
        return 0;
    }

    function _venueCount(uint8 mask) private pure returns (uint16 n) {
        if (mask & VENUE_AAVE != 0) n += 1;
        if (mask & VENUE_SPARK != 0) n += 1;
        if (mask & VENUE_COMPOUND != 0) n += 1;
    }

    function _tierOf(CreditProfile memory p) private pure returns (Tier) {
        // Blended stake: biggest single repayment in full + lifetime volume at 35%.
        // $100 x10 wash -> 100 + 350 = 450 (no Platinum); $1000 once -> 1000 + 350.
        uint256 stake = p.maxRepayment18 + (p.capacity18 * 35) / 100;
        if (p.defaults >= 1) {
            if (stake >= CAP_SILVER && _venueCount(p.venues) >= 2) return Tier.Gold;
            return Tier.Bronze;
        }
        uint16 v = _venueCount(p.venues);
        if (stake >= CAP_PLATINUM && v >= 3) return Tier.Platinum;
        if (stake >= CAP_SILVER && v >= 2) return Tier.Gold;
        if (stake >= CAP_SILVER && v >= 1) return Tier.Silver;
        return Tier.Bronze;
    }

    function _bpsForTier(Tier t) private pure returns (uint32) {
        if (t == Tier.Platinum) return 9_000;
        if (t == Tier.Gold) return 11_000;
        if (t == Tier.Silver) return 13_000;
        return 15_000;
    }

    // INTREST Bronze 18% / Silver 12% / Gold 8% / Platinum 5% +2% per default, cap 25%
    function _interestFor(Tier t, uint16 defaults) private pure returns (uint16 bps) {
        if (t == Tier.Platinum) bps = 500;
        else if (t == Tier.Gold) bps = 800;
        else if (t == Tier.Silver) bps = 1200;
        else bps = 1800;
        uint256 extra = uint256(defaults) * 200;
        if (extra > 700) extra = 700;
        bps += uint16(extra);
        if (bps > 2500) bps = 2500;
    }

    // INTREST
    function _syncInterest(address user) private {
        CreditProfile storage p = _profiles[user];
        uint16 bps = _interestFor(_tierOf(p), p.defaults);
        if (p.interestBps == bps) return;
        p.interestBps = bps;
        emit InterestUpdated(user, bps);
    }

    function _addCapacity(address user, uint256 amount18, uint8 bit) internal {
        if (amount18 == 0 || bit == 0) return;
        _initializeIfNeeded(user);
        _profiles[user].capacity18 += amount18;
        if (amount18 > _profiles[user].maxRepayment18) {
            _profiles[user].maxRepayment18 = amount18;
        }
        _profiles[user].venues |= bit;
        emit CapacityAdded(user, amount18, _profiles[user].capacity18, _profiles[user].venues);
        _syncInterest(user);
    }

    function _processAndEmitEvent(
        uint8 action,
        bytes32 queryId,
        uint64 chainKey,
        uint64 blockHeight,
        bytes memory encodedTransaction
    ) internal override whenNotPaused {
        if (action != 0) revert UnknownAction(action);

        uint8 txType = EvmV1Decoder.getTransactionType(encodedTransaction);
        if (!EvmV1Decoder.isValidTransactionType(txType)) {
            revert UnsupportedTransactionType(txType);
        }

        EvmV1Decoder.ReceiptFields memory rec =
            EvmV1Decoder.decodeReceiptFields(encodedTransaction);
        if (rec.receiptStatus != 1) revert SourceTransactionFailed(rec.receiptStatus);

        Parsed memory p;

        for (uint256 i; i < rec.receiptLogs.length; ++i) {
            EvmV1Decoder.LogEntry memory log = rec.receiptLogs[i];
            if (log.topics.length == 0) continue;
            SourceKind kind = sources[chainKey][log.address_];
            if (kind == SourceKind.None) continue;
            _ingestLog(kind, log, p);
        }

        if (p.hit == 0) revert NoRecognisedEvents();

        if (p.liqUser != address(0)) {
            decreaseScore(p.liqUser, p.liqSeverity18);
            _touch(p.liqUser, _sourceTime(chainKey, blockHeight));
        } else if (p.repayUser != address(0) && _selfFunded(p)) {
            emit FlashLoanIgnored(p.repayUser);
        } else if (p.repayUser != address(0)) {
            uint256 amount18 = _value18(p.repayToken, p.repayRaw);
            increaseScore(p.repayUser, amount18);
            if (p.defiRepay && ScoreCalculateLib.getPoints(amount18) > 0) {
                _addCapacity(p.repayUser, amount18, p.repayVenue);
            }
            _touch(p.repayUser, _sourceTime(chainKey, blockHeight));
        }

        queryId;
    }

    /// @dev Proof-covered height to approximate wall-clock time. Falls back to
    /// import time without an anchor; a later older proof corrects it downward.
    function _sourceTime(uint64 chainKey, uint64 blockHeight) private view returns (uint64) {
        ChainAnchor memory a = chainAnchors[chainKey];
        if (a.timestamp == 0 || blockHeight == 0) return uint64(block.timestamp);
        if (blockHeight >= a.height) {
            return a.timestamp + uint64(blockHeight - a.height) * a.secondsPerBlock;
        }
        uint64 delta = uint64(a.height - blockHeight) * a.secondsPerBlock;
        return delta >= a.timestamp ? uint64(block.timestamp) : a.timestamp - delta;
    }

    /// @dev Records earliest proven activity. Downward-only: older proofs help,
    /// newer ones cannot inflate tenure.
    function _touch(address user, uint64 observed) private {
        CreditProfile storage p = _profiles[user];
        if (p.oldestActivity == 0 || observed < p.oldestActivity) p.oldestActivity = observed;
    }

    function _ingestLog(
        SourceKind kind,
        EvmV1Decoder.LogEntry memory log,
        Parsed memory p
    ) internal view {
        bytes32 sig = log.topics[0];
        bool aaveLike = kind == SourceKind.AaveV3 || kind == SourceKind.SparkLend;

        if (aaveLike && sig == AAVE_REPAY) {
            if (log.topics.length < 4) revert ShortTopics();
            (uint256 amount,) = abi.decode(log.data, (uint256, bool));
            _bankRepay(p, _addr(log.topics[2]), _addr(log.topics[1]), log.address_, amount, _venueBit(kind), true);
        } else if (aaveLike && sig == AAVE_LIQ) {
            if (log.topics.length < 4) revert ShortTopics();
            p.liqUser = _addr(log.topics[3]);
            (uint256 debtToCover,) = abi.decode(log.data, (uint256, uint256));
            p.liqSeverity18 = _value18(_addr(log.topics[2]), debtToCover);
            ++p.hit;
        } else if (aaveLike && sig == AAVE_BORROW) {
            if (log.topics.length < 3) revert ShortTopics();
            p.borrowEmitter = log.address_;
            p.borrowToken = _addr(log.topics[1]);
            p.borrowUser = _addr(log.topics[2]);
            ++p.hit;
        } else if (kind == SourceKind.Compound && sig == COMPOUND_SUPPLY) {
            if (log.topics.length < 3) revert ShortTopics();
            address baseToken = cometBaseToken[log.address_];
            if (baseToken == address(0)) revert UnknownReserve(log.address_);
            (uint256 amount) = abi.decode(log.data, (uint256));
            _bankRepay(p, _addr(log.topics[2]), baseToken, log.address_, amount, VENUE_COMPOUND, true);
        } else if (kind == SourceKind.Compound && sig == COMPOUND_ABSORB) {
            if (log.topics.length < 4) revert ShortTopics();
            p.liqUser = _addr(log.topics[2]);
            (uint256 collateralAbsorbed,) = abi.decode(log.data, (uint256, uint256));
            p.liqSeverity18 = _value18(_addr(log.topics[3]), collateralAbsorbed);
            ++p.hit;
        } else if (kind == SourceKind.Compound && sig == COMPOUND_WITHDRAW) {
            if (log.topics.length < 3) revert ShortTopics();
            p.borrowEmitter = log.address_;
            p.borrowToken = cometBaseToken[log.address_];
            p.borrowUser = _addr(log.topics[1]);
            ++p.hit;
        } else if (kind == SourceKind.LoanFacility && sig == FACILITY_REPAY) {
            if (log.topics.length < 3) revert ShortTopics();
            (uint256 amount,) = abi.decode(log.data, (uint256, uint256));
            _bankRepay(p, _addr(log.topics[2]), WETH, log.address_, amount, 0, false);
        } else if (kind == SourceKind.LoanFacility && sig == FACILITY_DEFAULT) {
            if (log.topics.length < 3) revert ShortTopics();
            p.liqUser = _addr(log.topics[2]);
            (uint256 remaining) = abi.decode(log.data, (uint256));
            p.liqSeverity18 = _value18(WETH, remaining);
            ++p.hit;
        }
    }

    /// @dev Banks one repayment: first one wins the slot, same user+coin sums in.
    /// Different coin/user afterwards is ignored (documented keep-first).
    function _bankRepay(
        Parsed memory p,
        address user,
        address token,
        address emitter,
        uint256 raw,
        uint8 venueBit,
        bool defi
    ) private pure {
        if (p.repayUser == address(0)) {
            p.repayUser = user;
            p.repayToken = token;
            p.repayEmitter = emitter;
            p.repayRaw = raw;
            p.repayVenue = venueBit;
            p.defiRepay = defi;
        } else if (p.repayUser == user && p.repayToken == token) {
            p.repayRaw += raw;
            p.repayVenue |= venueBit;
            if (defi) p.defiRepay = true;
        }
        ++p.hit;
    }

    /// @dev Flash-funded iff borrow and repay share emitter, coin and user.
    function _selfFunded(Parsed memory p) private pure returns (bool) {
        return p.borrowUser != address(0) && p.borrowUser == p.repayUser
            && p.borrowToken == p.repayToken && p.borrowEmitter == p.repayEmitter;
    }
}