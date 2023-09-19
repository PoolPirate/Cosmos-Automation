import { LevanaMarket } from './common';
import Config from '../../../config.json';
import {
    Chain,
    executeMultiple,
    getAddress,
    queryContract,
} from '../../wallet/wallet';
import { ExecuteInstruction } from '@cosmjs/cosmwasm-stargate';

interface LevanaLPInfo {
    available_crank_rewards: string;
}

export async function runLevanaClaim(chain: Chain) {
    const marketsToClaim = (
        await Promise.all(
            Config.levana.markets.map(async (market) => {
                try {
                    const lpInfo = (await queryContract(
                        chain,
                        market.contract,
                        {
                            lp_info: {
                                liquidity_provider: getAddress(chain),
                            },
                        },
                    )) as LevanaLPInfo;

                    return parseFloat(lpInfo.available_crank_rewards) > 0
                        ? market
                        : null;
                } catch (error) {
                    console.error(`Claim Check Failed: ${error}`);
                    return null;
                }
            }),
        )
    )
        .filter((x) => x != null)
        .map<LevanaMarket>((x) => x!);

    if (marketsToClaim.length == 0) {
        return;
    }

    await claimMarkets(chain, marketsToClaim);
}

async function claimMarkets(chain: Chain, markets: LevanaMarket[]) {
    try {
        await executeMultiple(
            chain,
            markets.map<ExecuteInstruction>((market) => {
                return {
                    contractAddress: market.contract,
                    msg: {
                        claim_yield: {},
                    },
                };
            }),
            true,
            undefined,
            1.2,
        );
    } catch (error) {
        console.error('Claiming failed!\n' + error);
    }
}
