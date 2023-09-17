import { ExecuteInstruction } from "@cosmjs/cosmwasm-stargate";
import Config from "../../../config.json"
import { Chain, executeMultiple, queryContract } from "../../wallet/wallet";
import { LevanaMarket } from "./common";

interface LevanaStatus {
    next_crank: null | object;
}

export async function runLevanaCrank() {
    const marketsToCrank = (await Promise.all(Config.levana.markets.map(async market => {
        try {
            const status = await queryContract(Chain.Osmosis, market.contract, {
                status: {}
            }) as LevanaStatus;

            return status.next_crank != null
                ? market
                : null;
        } catch (error) {
            return null;
        }
    }))).filter(x => x != null).map<LevanaMarket>(x => x!);

    if (marketsToCrank.length == 0) {
        return;
    }

    await crankMarkets(marketsToCrank);
}

async function crankMarkets(markets: LevanaMarket[]) {
    await executeMultiple(Chain.Osmosis,
        markets.map<ExecuteInstruction>(market => {
            return {
                contractAddress: market.contract,
                msg: {
                    crank: {
                        execs: 10
                    }
                }
            }
        })
    );
}