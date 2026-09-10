import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import {
 sepolia,
 creditCoin3Testnet
} from 'wagmi/chains';

const config = getDefaultConfig({
  appName: 'Indenture',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID??"",
  chains: [sepolia, creditCoin3Testnet],
  ssr: true, 
});

export default config;