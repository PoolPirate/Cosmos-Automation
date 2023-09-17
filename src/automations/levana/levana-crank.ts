import { ExecuteInstruction } from "@cosmjs/cosmwasm-stargate";
import Config from "../../../config.json"
import { Chain, executeMultiple, queryContract } from "../../wallet/wallet";
import { LevanaMarket } from "./common";

interface LevanaStatus {
    next_crank: null | object;
}

export async function runLevanaCrank() {
    const marketsToCrank: LevanaMarket[] = [];

    for (let i = 0; i < Config.levana.markets.length; i++) {
        const market = Config.levana.markets[i]!;
        try {
            const status = await queryContract(Chain.Osmosis, market.contract, {
                status: {}
            }) as LevanaStatus;

            if (status.next_crank != null) {
                marketsToCrank.push(market);
            }
        } catch (error) {
        }
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