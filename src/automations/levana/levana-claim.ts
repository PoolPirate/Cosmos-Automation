import { LevanaMarket } from "./common";
import Config from "../../../config.json"
import { Chain, executeMultiple, getAddress, queryContract } from "../../wallet/wallet";
import { ExecuteInstruction } from "@cosmjs/cosmwasm-stargate";

interface LevanaLPInfo {
    available_crank_rewards: string;
}

export async function runLevanaClaim() {
    const marketsToClaim = (await Promise.all(Config.levana.markets.map(async market => {
        try {
            const lpInfo = await queryContract(Chain.Osmosis, market.contract, {
                lp_info: {
                    liquidity_provider: getAddress(Chain.Osmosis)
                }
            }) as LevanaLPInfo;

            return parseFloat(lpInfo.available_crank_rewards) > 0
                ? market
                : null;
        } catch (error) {
            return null;
        }
    }))).filter(x => x != null).map<LevanaMarket>(x => x!);

    if (marketsToClaim.length == 0) {
        return;
    }

    await claimMarkets(marketsToClaim);
}

async function claimMarkets(markets: LevanaMarket[]) {
    try {
        await executeMultiple(Chain.Osmosis,
            markets.map<ExecuteInstruction>(market => {
                return {
                    contractAddress: market.contract,
                    msg: {
                        "claim_yield": {}
                    }
                }
            }), true);
    } catch (error) {
        console.error("Claiming failed!\n" + error);
    }
}