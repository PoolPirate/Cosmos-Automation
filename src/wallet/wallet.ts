import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import Config from "../../config.json"
import { ExecuteInstruction, MsgExecuteContractEncodeObject, SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { MsgExecuteContract } from "cosmjs-types/cosmwasm/wasm/v1/tx";
import { toUtf8 } from "@cosmjs/encoding";
import Semaphore from "semaphore-promise";

export enum Chain {
    Osmosis = "osmo"
}

interface ChainData {
    wallet: DirectSecp256k1HdWallet;
    client: SigningCosmWasmClient;
    address: string;
    feeCurrency: string;
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

async function makeChainData(prefix: string, rpc: string, feeCurrency: string) {
    const hdWallet = await DirectSecp256k1HdWallet.fromMnemonic(Config.mnemonics, {
        prefix: prefix
    })

    return {
        wallet: hdWallet,
        client: await SigningCosmWasmClient.connectWithSigner(rpc, hdWallet),
        address: (await hdWallet.getAccounts())[0]!.address,
        feeCurrency: feeCurrency
    } satisfies ChainData;
}

export async function executeMultiple(chain: Chain, instructions: ExecuteInstruction[]) {
    const gas = Math.ceil(1.15 * await estimateExecuteGas(chain, instructions));

    if (gas < 200000) {
        return;
    }

    const { client, address } = chains.get(Chain.Osmosis)!;

    txSemaphore.acquire().then(async (release) => {
        await client.executeMultiple(address, instructions, {
            amount: [
                {
                    denom: "uosmo",
                    amount: `${Math.ceil(0.0025 * gas)}`
                }
            ],
            gas: `${gas}`
        });
        release();
    })
}

async function estimateExecuteGas(chain: Chain, instructions: ExecuteInstruction[]) {
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

    return await client.simulate(address, msgs, undefined);
}