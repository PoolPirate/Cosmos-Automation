import { LevanaMarket } from './common';
import Config from '../../../config.json';
import {
    executeMultiple,
    getAddress,
    queryContract,
} from '../../wallet/wallet';
import { ExecuteInstruction } from '@cosmjs/cosmwasm-stargate';
import { ChainName } from '../../wallet/types';

interface LevanaLPInfo {
    available_crank_rewards: string;
}

export async function runLevanaClaim(chain: ChainName) {
    console.log('Running Levana Claim');
    const marketsToClaim = (
        await Promise.all(
            Config.chains
                .find((x) => x.name == chain)!
                .levana.markets.map(async (market) => {
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
        console.log('Aborting: No Markets to claim found!');
        return;
    }

    await claimMarkets(chain, marketsToClaim);
}

async function claimMarkets(chain: ChainName, markets: LevanaMarket[]) {
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
            {
                simulateAsPrimary: true,
                gasMultiplicator: 1.3,
            },
        );
    } catch (error) {
        console.error('Claiming failed!\n' + error);
    }
}
