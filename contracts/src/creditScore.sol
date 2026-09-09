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
    address public constant MORPHO_BLUE =
        0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb;
    address public constant SPARK_POOL =
        0xC13e21B648A5Ee794902342038FF3aDAB66BE987;
    address public constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    address public constant USDT = 0xdAC17F958D2ee523a2206206994597C13D831ec7;
    address public constant DAI = 0x6B175474E89094C44Da98b954EedeAC495271d0F;
    address public constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address public constant WBTC = 0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599;

    uint8 public constant VENUE_AAVE = 1;
    uint8 public constant VENUE_SPARK = 2;
    uint8 public constant VENUE_MORPHO = 4;

    uint256 public constant CAP_SILVER = 100e18;
    uint256 public constant CAP_PLATINUM = 1_000e18;

    address public immutable loanFacility;

    bytes32 public constant AAVE_REPAY =
        keccak256("Repay(address,address,address,uint256,bool)");
    bytes32 public constant AAVE_LIQ =
        keccak256("LiquidationCall(address,address,address,uint256,uint256,address,bool)");
    bytes32 public constant AAVE_BORROW =
        keccak256("Borrow(address,address,address,uint256,uint8,uint256,uint16)");
    bytes32 public constant MORPHO_REPAY =
        keccak256("Repay(bytes32,address,address,uint256,uint256)");
    bytes32 public constant MORPHO_LIQ =
        keccak256("Liquidate(bytes32,address,address,uint256,uint256,uint256,uint256,uint256)");
    bytes32 public constant MORPHO_BORROW =
        keccak256("Borrow(bytes32,address,address,address,uint256,uint256)");
    bytes32 public constant FACILITY_REPAY =
        keccak256("LoanRepaid(uint256,address,uint256,uint256)");
    bytes32 public constant FACILITY_DEFAULT =
        keccak256("LoanDefaulted(uint256,address,uint256)");

    enum SourceKind {
        None,
        AaveV3,
        Morpho,
        SparkLend,
        LoanFacility
    }

    enum Tier {
        Bronze,
        Silver,
        Gold,
        Platinum
    }

    struct Parsed {
        address repayUser;
        address liqUser;
        address repayToken;
        uint256 repayRaw;
        uint256 hit;
        uint8 repayVenue;
        bool sawBorrow;
        bool defiRepay;
    }

    struct CreditProfile {
        uint16 score;
        bool isInitialized;
        uint256 capacity18;
        uint16 defaults;
        uint8 venues;
        // INTREST  1800 = 18.00% APR
        uint16 interestBps;
    }

    mapping(address => CreditProfile) private _profiles;
    mapping(uint64 => mapping(address => SourceKind)) public sources;
    mapping(address => uint8) public tokenDecimals;

    event ScoreIncreased(address indexed user, uint16 newScore, uint16 gained);
    event ScoreDecreased(address indexed user, uint16 newScore);
    event FlashLoanIgnored(address indexed user);
    event DustRepayIgnored(address indexed user, uint256 amount18);
    event CapacityAdded(address indexed user, uint256 amount18, uint256 capacity18, uint8 venues);
    event DefaultRecorded(address indexed user, uint16 defaults);
    // INTREST
    event InterestUpdated(address indexed user, uint16 interestBps);

    error UnknownAction(uint8 action);
    error UnsupportedTransactionType(uint8 txType);
    error SourceTransactionFailed(uint8 receiptStatus);
    error NoRecognisedEvents();
    error ShortTopics();
    error ZeroAddress();

    constructor(address facility) {
        if (facility == address(0)) revert ZeroAddress();
        loanFacility = facility;

        sources[ETH_MAINNET_KEY][AAVE_V3_POOL] = SourceKind.AaveV3;
        sources[ETH_MAINNET_KEY][MORPHO_BLUE] = SourceKind.Morpho;
        sources[ETH_MAINNET_KEY][SPARK_POOL] = SourceKind.SparkLend;
        sources[SEPOLIA_KEY][facility] = SourceKind.LoanFacility;

        tokenDecimals[USDC] = 6;
        tokenDecimals[USDT] = 6;
        tokenDecimals[DAI] = 18;
        tokenDecimals[WETH] = 18;
        tokenDecimals[WBTC] = 8;
    }

    function getScore(address user) public view returns (uint16) {
        if (!_profiles[user].isInitialized) return DEFAULT_SCORE;
        return _profiles[user].score;
    }

    function getCapacity(address user) public view returns (uint256) {
        return _profiles[user].capacity18;
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
        _initializeIfNeeded(user);
        (uint16 newScore, uint16 gained) =
            ScoreCalculateLib.applyIncrease(_profiles[user].score, MAX_SCORE, amount18);
        if (gained == 0) {
            emit DustRepayIgnored(user, amount18);
            return;
        }
        _profiles[user].score = newScore;
        _syncInterest(user);
        emit ScoreIncreased(user, newScore, gained);
    }

    function decreaseScore(address user) internal {
        _initializeIfNeeded(user);
        uint16 currentScore = _profiles[user].score;
        uint16 penalty = 120;
        uint16 newScore = currentScore <= MIN_SCORE + penalty ? MIN_SCORE : currentScore - penalty;
        _profiles[user].score = newScore;
        _profiles[user].defaults += 1;
        emit ScoreDecreased(user, newScore);
        emit DefaultRecorded(user, _profiles[user].defaults);
        _syncInterest(user);
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

    function _amount18(address token, uint256 raw) private view returns (uint256) {
        uint8 d = tokenDecimals[token];
        if (d == 0) d = 18;
        return ScoreCalculateLib.normalise(raw, d);
    }

    function _venueBit(SourceKind kind) private pure returns (uint8) {
        if (kind == SourceKind.AaveV3) return VENUE_AAVE;
        if (kind == SourceKind.SparkLend) return VENUE_SPARK;
        if (kind == SourceKind.Morpho) return VENUE_MORPHO;
        return 0;
    }

    function _venueCount(uint8 mask) private pure returns (uint16 n) {
        if (mask & VENUE_AAVE != 0) n += 1;
        if (mask & VENUE_SPARK != 0) n += 1;
        if (mask & VENUE_MORPHO != 0) n += 1;
    }

    function _tierOf(CreditProfile memory p) private pure returns (Tier) {
        if (p.defaults >= 1) {
            if (p.capacity18 >= CAP_SILVER && _venueCount(p.venues) >= 2) return Tier.Silver;
            return Tier.Bronze;
        }
        uint16 v = _venueCount(p.venues);
        if (p.capacity18 >= CAP_PLATINUM && v >= 3) return Tier.Platinum;
        if (p.capacity18 >= CAP_SILVER && v >= 2) return Tier.Gold;
        if (p.capacity18 >= CAP_SILVER && v >= 1) return Tier.Silver;
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
        uint16 extra = defaults * 200;
        if (extra > 700) extra = 700;
        bps += extra;
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
    ) internal override {
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
            decreaseScore(p.liqUser);
        } else if (p.repayUser != address(0) && p.sawBorrow) {
            emit FlashLoanIgnored(p.repayUser);
        } else if (p.repayUser != address(0)) {
            uint256 amount18 = _amount18(p.repayToken, p.repayRaw);
            increaseScore(p.repayUser, amount18);
            if (p.defiRepay && ScoreCalculateLib.getPoints(amount18) > 0) {
                _addCapacity(p.repayUser, amount18, p.repayVenue);
            }
        }

        queryId;
        blockHeight;
    }

    function _ingestLog(
        SourceKind kind,
        EvmV1Decoder.LogEntry memory log,
        Parsed memory p
    ) internal pure {
        bytes32 sig = log.topics[0];
        bool aaveLike = kind == SourceKind.AaveV3 || kind == SourceKind.SparkLend;

        if (aaveLike && sig == AAVE_REPAY) {
            if (log.topics.length < 4) revert ShortTopics();
            p.repayToken = _addr(log.topics[1]);
            p.repayUser = _addr(log.topics[2]);
            (uint256 amount,) = abi.decode(log.data, (uint256, bool));
            p.repayRaw = amount;
            p.repayVenue = _venueBit(kind);
            p.defiRepay = true;
            ++p.hit;
        } else if (aaveLike && sig == AAVE_LIQ) {
            if (log.topics.length < 4) revert ShortTopics();
            p.liqUser = _addr(log.topics[3]);
            ++p.hit;
        } else if (aaveLike && sig == AAVE_BORROW) {
            p.sawBorrow = true;
            ++p.hit;
        } else if (kind == SourceKind.Morpho && sig == MORPHO_REPAY) {
            if (log.topics.length < 4) revert ShortTopics();
            p.repayUser = _addr(log.topics[3]);
            (uint256 assets,) = abi.decode(log.data, (uint256, uint256));
            p.repayRaw = assets;
            p.repayToken = address(0);
            p.repayVenue = VENUE_MORPHO;
            p.defiRepay = true;
            ++p.hit;
        } else if (kind == SourceKind.Morpho && sig == MORPHO_LIQ) {
            if (log.topics.length < 4) revert ShortTopics();
            p.liqUser = _addr(log.topics[3]);
            ++p.hit;
        } else if (kind == SourceKind.Morpho && sig == MORPHO_BORROW) {
            p.sawBorrow = true;
            ++p.hit;
        } else if (kind == SourceKind.LoanFacility && sig == FACILITY_REPAY) {
            if (log.topics.length < 3) revert ShortTopics();
            p.repayUser = _addr(log.topics[2]);
            (uint256 amount,) = abi.decode(log.data, (uint256, uint256));
            p.repayRaw = amount;
            p.repayToken = WETH;
            ++p.hit;
        } else if (kind == SourceKind.LoanFacility && sig == FACILITY_DEFAULT) {
            if (log.topics.length < 3) revert ShortTopics();
            p.liqUser = _addr(log.topics[2]);
            ++p.hit;
        }
    }
}