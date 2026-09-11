import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import {
 sepolia,
 creditCoin3Testnet
} from 'wagmi/chains';
import { http, fallback } from 'wagmi';

const config = getDefaultConfig({
  appName: 'Indenture',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID??"",
  chains: [sepolia, creditCoin3Testnet],
  transports: {
    [sepolia.id]: http(),
    [creditCoin3Testnet.id]: fallback([
      http(process.env.NEXT_PUBLIC_CREDITCOIN_RPC_URL),
      http(),
    ]),
  },
  ssr: true, 
});

export default config;