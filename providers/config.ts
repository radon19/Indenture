import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import {
 sepolia,
 creditCoin3Testnet
} from 'wagmi/chains';

const config = getDefaultConfig({
  appName: 'Indenture',
  projectId: 'YOUR_PROJECT_ID',
  chains: [sepolia, creditCoin3Testnet],
  ssr: true, // If your dApp uses server side rendering (SSR)
});

export default config;