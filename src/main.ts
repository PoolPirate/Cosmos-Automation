import { runLevanaClaim } from './automations/levana/levana-claim';
import { runLevanaCrank } from './automations/levana/levana-crank';
import { initializeWallet, refreshPeakHeights } from './wallet/wallet';
import { ChainName } from './wallet/types';
import { runAutoSwapAsync } from './automations/swaps/autoswap';
import { initializeSkip } from './skip-api/skip-api';
import { runBuyGas } from './automations/swaps/buy-gas';
import { runFlushAsync } from './automations/swaps/flush';

main()
    .then(() => {})
    .catch((e) => console.error('APP CRASH! ' + e));

var lastCrankRun: Date;

async function main() {
    await initializeWallet();
    await initializeSkip();

    setTimeout(refreshPeakHeights, 1000); //Self refreshing
    setInterval(runAssetShifting, 1000 * 60 * 60 * 24);

    await runAssetShifting();
    await sleepInfinite();
}

async function runAssetShifting() {
    await runLevanaClaim(ChainName.Osmosis);
    await runAutoSwapAsync(ChainName.Osmosis);
    await runBuyGas();
    await runFlushAsync();
}

export async function handleNewBlock(
    chain: ChainName,
    height: number,
    timestamp: Date,
) {
    const processingStartTimeMs = new Date().getTime();
    const blockDelay = processingStartTimeMs - timestamp.getTime();

    console.log(`${chain} - ${height} (${blockDelay}ms late)`);

    await runLevanaCrank(chain, processingStartTimeMs);
    lastCrankRun = new Date();
}

async function sleepInfinite() {
    await new Promise(() => {});
}
