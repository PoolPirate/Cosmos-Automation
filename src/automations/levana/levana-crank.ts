import { ExecuteInstruction } from "@cosmjs/cosmwasm-stargate";
import Config from "../../../config.json"
import { Chain, executeMultiple, queryContract } from "../../wallet/wallet";
import { LevanaMarket } from "./common";

interface LevanaStatus {
    next_crank: null | object;
}

var previousCrankTasks: Map<string, string> = new Map<string, string>();

export async function runLevanaCrank(chain: Chain, blockDelay: number) {
    const started = new Date().getTime();

    const marketsToCrank = (await Promise.all(Config.levana.markets.map(async market => {
        try {
            const status = await queryContract(chain, market.contract, {
                status: {}
            }) as LevanaStatus;

            if (previousCrankTasks.get(market.contract) == JSON.stringify(status.next_crank)) {
                return null;
            }
            previousCrankTasks.set(market.contract, JSON.stringify(status.next_crank));

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

    const elapsed = new Date().getTime() - started;

    if (blockDelay + elapsed > 18000) {
        console.log(`CRANK aborted - Delay: ${blockDelay} + ${elapsed}`);
        return;
    }

    await crankMarkets(chain, marketsToCrank);
    console.log(`CRANKED - Filter: ${elapsed}ms`);
}

async function crankMarkets(chain: Chain, markets: LevanaMarket[]) {
    try {
        await executeMultiple(chain,
            markets.map<ExecuteInstruction>(market => {
                return {
                    contractAddress: market.contract,
                    msg: {
                        crank: {
                            execs: 10
                        }
                    }
                }
            }), false, 170000 * markets.length
        );
    } catch (error) {
        console.log(`Crank TX Failed: ${error}`);
        previousCrankTasks.clear();
    }
}