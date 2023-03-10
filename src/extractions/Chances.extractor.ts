import { BaseExtractor } from "../classes/BaseExtractor";
import { readFile } from "fs/promises";

export default class ChancesExtractor extends BaseExtractor {

    private readonly STONE_CHECK_FILE = this.getRelativePath('data/mt/functions/treasure_chest/tiers/stone_check_');
    private readonly CHANCES = ["common", "rare", "epic", "legendary"];

    public async Extract(): Promise<unknown> {

        const regex = /execute if entity @s\[scores={mt\.break_(.+)=1\.\.,mt\.(.+)_chance=\.\.(\d+)}.*?]/gm;
        const lookupTable = this.passingData["varToBlock"];

        let out: Record<string, Record<string, number>> = {};

        for (const rarity of this.CHANCES) {
            const stoneCheckFile_contents = await readFile(this.STONE_CHECK_FILE + rarity + ".mcfunction", 'utf-8');
            let m;

            while ((m = regex.exec(stoneCheckFile_contents)) !== null) {
                if (m.index === regex.lastIndex) {
                    regex.lastIndex++;
                }

                let block = m[1];
                const category = m[2];
                const chance = parseInt(m[3]);

                const mcBlock = lookupTable[block];
                if (!out[mcBlock]) {
                    out[mcBlock] = {};
                }

                out[mcBlock][category] = chance;
            }
        }

        this.writeOut(out);

        return this.passingData;
    }
}