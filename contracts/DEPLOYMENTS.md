# DEPLOYMENTS — Indenture on Creditcoin testnet (102031)

```bash
# Safe infra (official v1.4.1 bytecode, deployed by us — chain has no canonical set)
# Singleton, handler, multisend verified with code on-chain. Factory address
# below is transcribed, NOT verified — only needed again to create more Safes.
export SINGLETON=0xDae64500f66E46f1444fC05c1Ce9d0429a9b4c4d
export HANDLER=0xC8E1A330C29301a570A3C35B38aF3494624409c6
export MULTISEND=0x00397Bbae501F0Dc635a6221F55cDbcF3DDD62B1
export DEPLOYER=0x43337d2Dfa67950EE9b989F231749dC2DC01C8d3
# Our 2-of-3 Safe (all three verified on-chain: threshold 2, owners below)
export SAFE=0x057463C89aa9B0Cef7362E4f6a9505f305e2F240
export OWNER1=0x11040F408494b0ba244F6ff59ccB8F17cF8d1017   # human
export OWNER2=0x4D6CBA6B600D1e8dfB6D7d968CB81d0EF301Fa83   # backend (hot)
export OWNER3=0xB1aF64FFEB68Dcc4CE0bBA86a2329738cCF55b9e   # cold backup

# App contracts (all owned by $SAFE)
export SEPOLIA_FACILITY=0xbdf493355791f129aad0b11c912b271ca8558387  # Sepolia 11155111
export NEWSCORES=0xFA19b4DDCEA765Ce8662ec9ea15438Adce44E237
export NEWPOOL=0x5e78fb780f43b31B9b32d84C4482e4A8eD89DD4d
export OLDSTABLE=0xFdCDfbd1533DFA005E7BE3c4d82d95c98Fadcd39
```

Verify anytime:

```bash
cast call $SAFE "getThreshold()" --rpc-url $CREDITCOIN_RPC_URL        # 2
cast call $SAFE "getOwners()" --rpc-url $CREDITCOIN_RPC_URL            # the three above
for C in $NEWSCORES $NEWPOOL $OLDSTABLE; do cast call $C "owner()" --rpc-url $CREDITCOIN_RPC_URL; done
```

## How the mechanism works

A Safe is two contracts, not one. The **singleton** holds all the logic and
never holds state; your **proxy** holds all the state (owners, threshold,
nonce) and `delegatecall`s into it. Upgrading logic never touches your vault.

Spending works in three beats, always in this order:

1. **Propose** — anyone builds the transaction (destination, value, calldata)
   plus a Safe nonce (strictly increasing — no replay, no reorder).
2. **Confirm** — owners sign the EIP-712 hash of it *off-chain*. Any 2 of the
   3 signatures count, in any order, collected anywhere (chat, QR, script).
3. **Execute** — anyone (even a non-owner) submits the transaction plus the
   two signatures on-chain. The Safe checks signatures, threshold, and nonce,
   then performs the call *as itself* — so `setPrice` sees `msg.sender ==
   Safe`, the owner.

Why this shape matters for us: daily price pushes get proposed by the backend
key and co-signed by you; recovery (rotating a leaked backend key) needs you +
cold, so a server breach alone can never take the registry; and because every
signature is just bytes, the whole flow works without any UI — scripts and
cast suffice until a frontend exists.
