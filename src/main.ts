
import { runLevanaClaim } from "./automations/levana/levana-claim";
import { runLevanaCrank } from "./automations/levana/levana-crank";
import { Chain, initializeWallet, refreshPeakHeights } from "./wallet/wallet";

main()
    .then(() => { })
    .catch((e) => console.error("APP CRASH! " + e));

var lastCrankRun: Date;

async function main() {
    await initializeWallet();

    setTimeout(refreshPeakHeights, 1000); //Self refreshing

    setInterval(runLevanaClaim, 14400000);

    await sleepInfinite();
}

export async function handleNewBlock(chain: Chain, height: number, timestamp: Date) {
    const blockDelay = new Date().getTime() - timestamp.getTime();
    console.log(`${chain} - ${height} (${blockDelay}ms late)`)

    await runLevanaCrank(chain, blockDelay);
    lastCrankRun = new Date();
}


async function sleepInfinite() {
    await new Promise(() => { });
}
