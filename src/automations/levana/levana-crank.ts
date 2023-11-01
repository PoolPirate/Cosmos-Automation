import { ExecuteInstruction } from '@cosmjs/cosmwasm-stargate';
import Config from '../../../config.json';
import { executeMultiple, queryContract } from '../../wallet/wallet';
import { LevanaMarket } from './common';
import { ChainName } from '../../wallet/types';

interface LevanaStatus {
    next_crank: null | object;
}

var previousCrankTasks: Map<string, string> = new Map<string, string>();

export async function runLevanaCrank(
    chain: ChainName,
    processingStartTimeMs: number,
) {
    try {
        const marketsToCrank = (
            await Promise.all(
                Config.chains
                    .find((x) => x.name == chain)!
                    .levana.markets.map(async (market) => {
                        try {
                            const status = (await queryContract(
                                chain,
                                market.contract,
                                {
                                    status: {},
                                },
                            )) as LevanaStatus;

                            if (status.next_crank == null) {
                                return null;
                            }

                            if (
                                previousCrankTasks.get(market.contract) ==
                                JSON.stringify(status.next_crank)
                            ) {
                                console.log(`${market.contract} UNCHANGED`);
                                return null;
                            }

                            previousCrankTasks.set(
                                market.contract,
                                JSON.stringify(status.next_crank),
                            );

                            console.log(
                                `${market.contract} FOUND: ${JSON.stringify(
                                    status.next_crank,
                                )}`,
                            );

                            return market;
                        } catch (error) {
                            console.error(
                                `Crank Check Failed (${chain}): ${error}`,
                            );
                            return null;
                        }
                    }),
            )
        )
            .filter((x) => x != null)
            .map<LevanaMarket>((x) => x!);

        if (marketsToCrank.length == 0) {
            return;
        }

        await crankMarkets(chain, marketsToCrank, processingStartTimeMs);
    } catch (error) {
        console.error('Cranking Died');
    }
}

var forceGasOverride: number | undefined = undefined;

async function crankMarkets(
    chain: ChainName,
    markets: LevanaMarket[],
    processingStartTimeMs: number,
) {
    try {
        await executeMultiple(
            chain,
            markets.map<ExecuteInstruction>((market) => {
                return {
                    contractAddress: market.contract,
                    msg: {
                        crank: {
                            execs: 5,
                        },
                    },
                };
            }),
            {
                minimumGas:
                    chain == ChainName.Osmosis ? 210000 * markets.length : 0,
                gasMultiplicator: forceGasOverride ?? 1.06,
                gasBuffer: 75000,
                processingStartTimeMs: processingStartTimeMs,
                maxProcessingDelayMs: 17000,
            },
        );

        console.log(
            `Crank TX Successful (${chain}) - Filter: ${
                new Date().getTime() - processingStartTimeMs
            }ms`,
        );
        forceGasOverride = undefined;
    } catch (error) {
        if (String(error).includes('out of gas')) {
            forceGasOverride = forceGasOverride ?? 1 + 0.2;
            console.log(`Crank TX Failed (${chain}): Out of Gas, Repeating`);
            await crankMarkets(chain, markets, processingStartTimeMs);
        } else if (String(error).includes('price_too_old')) {
            const msg_index = parseInt(
                String(error).split('message index: 0')[0]?.split(':')[0]!,
            );
            const market = markets[msg_index];
            console.log(
                `Crank TX Failed (${chain}): Price outdated (${market?.contract})`,
            );
            await crankMarkets(
                chain,
                markets.filter((x) => x.contract != market?.contract),
                processingStartTimeMs,
            );
        } else {
            forceGasOverride = undefined;
            console.log(`Crank TX Failed (${chain}): ${error}`);
        }

        previousCrankTasks.clear();
    }
}
