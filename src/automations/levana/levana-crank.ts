import Config from "../../../config.json"
import { Chain, executeMultiple } from "../../wallet/wallet";
import { LevanaMarket } from "./common";

export async function runLevanaCrank() {
    for (let i = 0; i < Config.levana.markets.length; i++) {
        const market = Config.levana.markets[i]!;
        try {
            await crankMarket(market);
        } catch (error) {
            console.warn(`Crank failed\n${error}`)
        }
    }
}

async function crankMarket(market: LevanaMarket) {
    await executeMultiple(Chain.Osmosis, [
        {
            contractAddress: market.contract,
            msg: {
                crank: {
                    execs: 10
                }
            }
        }
    ])
}