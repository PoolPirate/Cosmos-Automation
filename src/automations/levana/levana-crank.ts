import { ExecuteInstruction } from '@cosmjs/cosmwasm-stargate';
import Config from '../../../config.json';
import { Chain, executeMultiple, queryContract } from '../../wallet/wallet';
import { LevanaMarket } from './common';

interface LevanaStatus {
    next_crank: null | object;
}

var previousCrankTasks: Map<string, string> = new Map<string, string>();

export async function runLevanaCrank(
    chain: Chain,
    processingStartTimeMs: number,
) {
    const marketsToCrank = (
        await Promise.all(
            Config.levana.markets.map(async (market) => {
                try {
                    const status = (await queryContract(
                        chain,
                        market.contract,
                        {
                            status: {},
                        },
                    )) as LevanaStatus;

                    if (
                        previousCrankTasks.get(market.contract) ==
                        JSON.stringify(status.next_crank)
                    ) {
                        return null;
                    }
                    previousCrankTasks.set(
                        market.contract,
                        JSON.stringify(status.next_crank),
                    );

                    return status.next_crank != null ? market : null;
                } catch (error) {
                    console.error(`Crank Check Failed: ${error}`);
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
    console.log(
        `CRANKED - Filter: ${new Date().getTime() - processingStartTimeMs}ms`,
    );
}

var forceGasOverride: number | undefined = undefined;

async function crankMarkets(
    chain: Chain,
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
                            execs: 10,
                        },
                    },
                };
            }),
            {
                minimumGas: 170000 * markets.length,
                gasMultiplicator: forceGasOverride ?? 1.08,
                processingStartTimeMs: processingStartTimeMs,
                maxProcessingDelayMs: 17000,
            },
        );

        forceGasOverride = undefined;
    } catch (error) {
        if (error instanceof Error && error.message.includes('Code 11;')) {
            forceGasOverride = 3;
            console.log('Crank TX Failed: Out of Gas, Repeating');
            await crankMarkets(chain, markets, processingStartTimeMs);
        } else {
            forceGasOverride = undefined;
            console.log(`Crank TX Failed: ${error}`);
        }

        previousCrankTasks.clear();
    }
}
