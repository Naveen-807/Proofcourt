import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import '@rainbow-me/rainbowkit/styles.css';
import App from './App.tsx';
import './index.css';
import { Web3Provider } from './web3/Web3Provider.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Web3Provider>
      <App />
    </Web3Provider>
  </StrictMode>,
);
