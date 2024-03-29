import {
    DirectSecp256k1HdWallet,
    EncodeObject,
    coin,
} from '@cosmjs/proto-signing';
import Config from '../../config.json';
import {
    ExecuteInstruction,
    MsgExecuteContractEncodeObject,
    SigningCosmWasmClient,
} from '@cosmjs/cosmwasm-stargate';
import { MsgExecuteContract } from 'cosmjs-types/cosmwasm/wasm/v1/tx';
import { toUtf8 } from '@cosmjs/encoding';
import Semaphore from 'semaphore-promise';
import { handleNewBlock } from '../main';
import { ChainName, ChainData } from './types';
import { SequenceResponse, StargateClient } from '@cosmjs/stargate';
import { overrideAccountParser } from './utils/inj-account-parser';

var chains: Map<ChainName, ChainData> = null!;

export async function initializeWallet() {
    console.log('Initializing wallet');

    overrideAccountParser();
    chains = new Map<ChainName, ChainData>();

    for (let i = 0; i < Config.chains.length; i++) {
        const chain = Config.chains[i]!;
        const chainData = await makeChainData(
            chain.name as ChainName,
            chain.prefix,
            chain.queryRpc,
            chain.txRpc,
            chain.feeCurrency,
            chain.gasPrice,
        );
        chains.set(chain.name as ChainName, chainData);
        console.log(`${chain.prefix} - ${chainData.txAddress}`);
    }

    console.log('Wallet setup complete');
}

export function getAddress(chain: ChainName) {
    return chains.get(chain)!.txAddress;
}

export function refreshPeakHeights() {
    const chains = Object.values(ChainName) as ChainName[];
    chains.forEach((chain) => refreshPeakHeight(chain, 1));
}

async function refreshPeakHeight(chain: ChainName, callsSinceUpdate: number) {
    const chainData = chains.get(chain)!;
    const { queryClient, peakHeight } = chainData;

    try {
        const block = await queryClient.getBlock();
        const height = block.header.height;

        if (height > peakHeight) {
            chainData.peakHeight = height;
            setTimeout(() => refreshPeakHeight(chain, 1), 4400);
            handleNewBlock(chain, height);
            return;
        }

        setTimeout(
            () => refreshPeakHeight(chain, callsSinceUpdate + 1),
            Math.max(333, 750 / callsSinceUpdate),
        );
    } catch (error) {
        setTimeout(() => refreshPeakHeight(chain, callsSinceUpdate), 1000);
    }
}

function incrementSequence(chain: ChainName) {
    chains.get(chain)!.currentTxSequence += 1;
}

function setSequence(chain: ChainName, sequence: number) {
    chains.get(chain)!.currentTxSequence = sequence;
}

async function makeChainData(
    name: ChainName,
    prefix: string,
    queryRpc: string,
    txRpc: string,
    feeCurrency: string,
    minimumGasPrice: number,
) {
    const hdWallet = await DirectSecp256k1HdWallet.fromMnemonic(
        Config.mnemonics,
        {
            prefix: prefix,
        },
    );
    const queryHdWallet = await DirectSecp256k1HdWallet.fromMnemonic(
        Config.queryMnemonics,
        {
            prefix: prefix,
        },
    );

    const queryClient = await SigningCosmWasmClient.connectWithSigner(
        queryRpc,
        queryHdWallet,
    );

    const txClient = await SigningCosmWasmClient.connectWithSigner(
        txRpc,
        hdWallet,
    );

    const txAddress = (await hdWallet.getAccounts())[0]!.address;

    const sequence = await txClient.getSequence(txAddress);

    const previousGetSequence = txClient.getSequence;
    txClient.getSequence = async (address) => {
        if (address != txAddress) {
            return await previousGetSequence(address);
        }

        var seq = {
            accountNumber: sequence.accountNumber,
            sequence: chains.get(name)!.currentTxSequence,
        } satisfies SequenceResponse;
        return seq;
    };

    return {
        wallet: hdWallet,
        txClient: txClient,
        txAddress: txAddress,
        currentTxSequence: sequence.sequence,
        txSemaphore: new Semaphore(1),
        queryClient: queryClient,
        queryAddress: (await queryHdWallet.getAccounts())[0]!.address,
        feeCurrency: feeCurrency,
        peakHeight: (await queryClient.getBlock()).header.height,
        minimumGasPrice: minimumGasPrice,
    } satisfies ChainData;
}

async function tx<T>(
    chain: ChainName,
    func: () => Promise<T>,
    options?: ExecutionOptions,
    attempt?: number,
): Promise<T> {
    attempt ??= 1;
    const semaphore = chains.get(chain)!.txSemaphore;
    const release = await semaphore.acquire();

    if (
        (options?.maxAttempts != undefined && attempt > options.maxAttempts) ||
        attempt > 3
    ) {
        release();
        throw Error(`Aborted: Maximum attempts reached (${attempt})`);
    }
    if (
        options?.maxTotalDelayMs != undefined &&
        options?.blockTimeMs != undefined
    ) {
        if (
            options.blockTimeMs + options.maxTotalDelayMs <
            new Date().getTime()
        ) {
            release();
            throw Error('Aborted: Total Delay too high');
        }
    }
    if (
        options?.maxProcessingDelayMs != undefined &&
        options?.processingStartTimeMs != undefined
    ) {
        if (
            options.processingStartTimeMs + options.maxProcessingDelayMs <
            new Date().getTime()
        ) {
            release();
            throw Error('Aborted: Processing Delay too high');
        }
    }

    let result: T = undefined!;

    try {
        result = await func();
        release();
        incrementSequence(chain);
        return result;
    } catch (e) {
        release();

        if (String(e).includes('Length must be a multiple of 4')) {
            return result;
        }
        if (String(e).includes('incorrect account sequence')) {
            console.warn(e);
            const parts = String(e).split(' ');
            const i = parts.findLastIndex((x) => x == 'expected');
            setSequence(chain, parseInt(parts[i + 1]!));
            return await tx(chain, func, options, attempt + 1);
        }
        if (String(e).includes('out of gas')) {
            incrementSequence(chain);
            throw e;
        }

        console.warn(`${chain} Tx Failed: ${e}. Retrying...`);
        await new Promise((resolve) => setTimeout(resolve, 250));
        return await tx(chain, func, options, attempt + 1);
    }
}

async function query<T>(func: () => Promise<T>) {
    return await func();
}

export async function queryContract(
    chain: ChainName,
    contract: string,
    message: any,
) {
    const { queryClient } = chains.get(chain)!;
    return await query(
        async () => await queryClient.queryContractSmart(contract, message),
    );
}

export async function getBalance(chain: ChainName, denom: string) {
    const { queryClient, txAddress } = chains.get(chain)!;

    const coin = await queryClient.getBalance(txAddress, denom);
    return parseInt(coin.amount);
}

export async function send(
    chain: ChainName,
    recipient: string,
    denom: string,
    amount: number,
) {
    const { txAddress, txClient, minimumGasPrice, feeCurrency } =
        chains.get(chain)!;

    await tx(
        chain,
        async () =>
            await txClient.sendTokens(
                txAddress,
                recipient,
                [coin(amount, denom)],
                {
                    gas: '90000',
                    amount: [
                        coin(Math.ceil(90000 * minimumGasPrice), feeCurrency),
                    ],
                },
            ),
    );
}

export interface ExecutionOptions {
    simulateAsPrimary?: boolean;
    minimumGas?: number;
    gasMultiplicator?: number;
    gasBuffer?: number;
    blockTimeMs?: number;
    maxTotalDelayMs?: number;
    maxAttempts?: number;
    processingStartTimeMs?: number;
    maxProcessingDelayMs?: number;
}
const defaultExecutionOptions = {
    simulateAsPrimary: false,
    minimumGas: 0,
    gasMultiplicator: 1.08,
} as const satisfies ExecutionOptions;

export async function executeMultiple(
    chain: ChainName,
    instructions: ExecuteInstruction[],
    execOptions: ExecutionOptions,
) {
    const options = { ...defaultExecutionOptions, ...execOptions };
    const gas = await estimateExecuteGas(
        chain,
        instructions,
        options.simulateAsPrimary,
    );

    const bufferedGas = Math.ceil(
        options.gasMultiplicator * gas + (options.gasBuffer ?? 0),
    );

    if (gas < options.minimumGas) {
        return;
    }

    const { txClient, txAddress, feeCurrency, minimumGasPrice } =
        chains.get(chain)!;

    await tx(
        chain,
        async () => {
            await txClient.executeMultiple(txAddress, instructions, {
                amount: [
                    {
                        denom: feeCurrency,
                        amount: `${Math.ceil(minimumGasPrice * bufferedGas)}`,
                    },
                ],
                gas: `${bufferedGas}`,
            });
        },
        options,
    );
}

export async function transactMultiple(
    chain: ChainName,
    instructions: EncodeObject[],
    execOptions: ExecutionOptions,
) {
    const options = { ...defaultExecutionOptions, ...execOptions };
    const gas = await estimateTransactGas(
        chain,
        instructions,
        options.simulateAsPrimary,
    );

    const bufferedGas = Math.ceil(
        options.gasMultiplicator * gas + (options.gasBuffer ?? 0),
    );

    if (gas < options.minimumGas) {
        return;
    }

    const { txClient, txAddress, feeCurrency, minimumGasPrice } =
        chains.get(chain)!;

    await tx(
        chain,
        async () => {
            await txClient.signAndBroadcast(txAddress, instructions, {
                amount: [
                    {
                        denom: feeCurrency,
                        amount: `${Math.ceil(minimumGasPrice * bufferedGas)}`,
                    },
                ],
                gas: `${bufferedGas}`,
            });
        },
        options,
    );
}

async function estimateExecuteGas(
    chain: ChainName,
    instructions: ExecuteInstruction[],
    usePrimary: boolean,
) {
    if (!usePrimary) {
        const { queryClient, queryAddress } = chains.get(chain)!;

        const msgs: MsgExecuteContractEncodeObject[] = instructions.map(
            (i) => ({
                typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
                value: MsgExecuteContract.fromPartial({
                    sender: queryAddress,
                    contract: i.contractAddress,
                    msg: toUtf8(JSON.stringify(i.msg)),
                    funds: [...(i.funds || [])],
                }),
            }),
        );

        return await query(
            async () =>
                await queryClient.simulate(queryAddress, msgs, undefined),
        );
    } else {
        const { txClient, txAddress } = chains.get(chain)!;

        const msgs: MsgExecuteContractEncodeObject[] = instructions.map(
            (i) => ({
                typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
                value: MsgExecuteContract.fromPartial({
                    sender: txAddress,
                    contract: i.contractAddress,
                    msg: toUtf8(JSON.stringify(i.msg)),
                    funds: [...(i.funds || [])],
                }),
            }),
        );

        return await query(
            async () => await txClient.simulate(txAddress, msgs, undefined),
        );
    }
}

async function estimateTransactGas(
    chain: ChainName,
    instructions: EncodeObject[],
    usePrimary: boolean,
) {
    if (!usePrimary) {
        const { queryClient, queryAddress } = chains.get(chain)!;

        return await query(
            async () =>
                await queryClient.simulate(
                    queryAddress,
                    instructions,
                    undefined,
                ),
        );
    } else {
        const { txClient, txAddress } = chains.get(chain)!;

        return await query(
            async () =>
                await txClient.simulate(txAddress, instructions, undefined),
        );
    }
}
