import { DirectSecp256k1HdWallet, coin } from "@cosmjs/proto-signing";
import Config from "../../config.json"
import { ExecuteInstruction, MsgExecuteContractEncodeObject, SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { MsgExecuteContract } from "cosmjs-types/cosmwasm/wasm/v1/tx";
import { toUtf8 } from "@cosmjs/encoding";
import { ReconnectingSocket } from "@cosmjs/socket"
import Semaphore from "semaphore-promise";
import { handleNewBlock } from "../main";

export enum Chain {
    Osmosis = "osmo"
}

interface ChainData {
    wallet: DirectSecp256k1HdWallet;
    client: SigningCosmWasmClient;
    address: string;
    queryClient: SigningCosmWasmClient;
    queryAddress: string;
    feeCurrency: string;
    peakHeight: number;
}

var chains: Map<Chain, ChainData> = null!;

const txSemaphore = new Semaphore(1);

export async function initializeWallet() {
    console.log("Initializing wallet");
    chains = new Map<Chain, ChainData>;

    for (let i = 0; i < Config.chains.length; i++) {
        const chain = Config.chains[i]!;
        const chainData = await makeChainData(chain.prefix, chain.rpc, chain.feeCurrency);
        chains.set(chain.prefix as Chain, chainData);
        console.log(`${chain.prefix} - ${chainData.address}`)
    }

    console.log("Wallet setup complete");
}

export function getAddress(chain: Chain) {
    return chains.get(chain)!.address;
}

export async function refreshPeakHeights() {
    const chains = Object.values(Chain) as Chain[];
    chains.forEach(chain => refreshPeakHeight(chain, 1));
}

async function refreshPeakHeight(chain: Chain, callsSinceUpdate: number) {
    const chainData = chains.get(chain)!;
    const { queryClient, peakHeight } = chainData;

    try {
        const height = (await queryClient.getBlock()).header.height;

        if (height > peakHeight) {
            chainData.peakHeight = height;
            setTimeout(() => refreshPeakHeight(chain, 1), 4000);
            handleNewBlock(chain, height);
            return;
        }

        setTimeout(() => refreshPeakHeight(chain, callsSinceUpdate + 1), Math.max(333, 800 / callsSinceUpdate));
    } catch (error) {
        setTimeout(() => refreshPeakHeight(chain, callsSinceUpdate), 1000);
    }
}

async function makeChainData(prefix: string, rpc: string, feeCurrency: string) {
    const hdWallet = await DirectSecp256k1HdWallet.fromMnemonic(Config.mnemonics, {
        prefix: prefix
    })
    const queryHdWallet = await DirectSecp256k1HdWallet.fromMnemonic(Config.queryMnemonics, {
        prefix: prefix
    });

    const queryClient = await SigningCosmWasmClient.connectWithSigner(rpc, queryHdWallet);

    return {
        wallet: hdWallet,
        client: await SigningCosmWasmClient.connectWithSigner(rpc, hdWallet),
        address: (await hdWallet.getAccounts())[0]!.address,
        queryClient: queryClient,
        queryAddress: (await queryHdWallet.getAccounts())[0]!.address,
        feeCurrency: feeCurrency,
        peakHeight: (await queryClient.getBlock()).header.height
    } satisfies ChainData;
}

async function tx<T>(func: () => Promise<T>) {
    const release = await txSemaphore.acquire();

    try {
        return await func();
    } finally {
        release();
    }
}

async function query<T>(func: () => Promise<T>) {
    return await func();
}

export async function queryContract(chain: Chain, contract: string, message: any) {
    const { queryClient } = chains.get(Chain.Osmosis)!;
    return await query(async () => await queryClient.queryContractSmart(contract, message));
}

export async function executeMultiple(chain: Chain, instructions: ExecuteInstruction[], simulateAsPrimary: boolean = false) {
    const gas = Math.ceil(1.15 * await estimateExecuteGas(chain, instructions, simulateAsPrimary));

    const { client, address } = chains.get(Chain.Osmosis)!;

    await tx(async () => {
        await client.executeMultiple(address, instructions, {
            amount: [
                {
                    denom: "uosmo",
                    amount: `${Math.ceil(0.0025 * gas)}`
                }
            ],
            gas: `${gas}`
        });
    });
}

async function estimateExecuteGas(chain: Chain, instructions: ExecuteInstruction[], usePrimary: boolean) {
    if (!usePrimary) {
        const { queryClient, queryAddress } = chains.get(chain)!;

        const msgs: MsgExecuteContractEncodeObject[] = instructions.map((i) => ({
            typeUrl: "/cosmwasm.wasm.v1.MsgExecuteContract",
            value: MsgExecuteContract.fromPartial({
                sender: queryAddress,
                contract: i.contractAddress,
                msg: toUtf8(JSON.stringify(i.msg)),
                funds: [...(i.funds || [])],
            }),
        }));

        return await query(async () => await queryClient.simulate(queryAddress, msgs, undefined));
    } else {
        const { client, address } = chains.get(chain)!;

        const msgs: MsgExecuteContractEncodeObject[] = instructions.map((i) => ({
            typeUrl: "/cosmwasm.wasm.v1.MsgExecuteContract",
            value: MsgExecuteContract.fromPartial({
                sender: address,
                contract: i.contractAddress,
                msg: toUtf8(JSON.stringify(i.msg)),
                funds: [...(i.funds || [])],
            }),
        }));

        return await tx(async () => await client.simulate(address, msgs, undefined));
    }
}