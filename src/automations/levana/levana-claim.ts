import { LevanaMarket } from "./common";
import Config from "../../../config.json"
import { Chain, executeMultiple } from "../../wallet/wallet";

export async function runLevanaClaim() {
    for (let i = 0; i < Config.levana.markets.length; i++) {
        const market = Config.levana.markets[i]!;
        try {
            await claimMarket(market);
        } catch (error) {
            console.warn(`Claim failed\n${error}`)
        }
    }
}

async function claimMarket(market: LevanaMarket) {
    await executeMultiple(Chain.Osmosis, [
        {
            contractAddress: market.contract,
            msg: {
                "claim_yield": {}
            }
        }
    ])
}