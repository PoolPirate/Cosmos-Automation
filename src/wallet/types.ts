import { SigningCosmWasmClient } from '@cosmjs/cosmwasm-stargate';
import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import Semaphore from 'semaphore-promise';

export enum ChainName {
    Osmosis = 'osmosis',
}

export interface ChainData {
    wallet: DirectSecp256k1HdWallet;
    txClient: SigningCosmWasmClient;
    txAddress: string;
    txSemaphore: Semaphore;
    queryClient: SigningCosmWasmClient;
    queryAddress: string;
    feeCurrency: string;
    peakHeight: number;
}
