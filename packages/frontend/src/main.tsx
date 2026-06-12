import React from 'react';
import ReactDOM from 'react-dom/client';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import { App } from './App';
import { wagmiConfig } from './config';
import './index.css';

const queryClient = new QueryClient();

// Match RainbowKit's modals to the EquinoxFi deep-space palette.
const equinoxTheme = darkTheme({
  accentColor: '#4f46e5', // indigo
  accentColorForeground: 'white',
  borderRadius: 'large',
});
equinoxTheme.colors.modalBackground = '#11162e'; // midnight-light
equinoxTheme.colors.connectButtonBackground = '#11162e';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={equinoxTheme} modalSize="compact">
          <App />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>,
);
