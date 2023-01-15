import { BaseExtractor } from "../classes/BaseExtractor";
import { readFile } from "fs/promises";

export default class Default_ChancesExtractor extends BaseExtractor {

    private readonly MID_FILE = this.getRelativePath('data/mt/functions/settings/mid.mcfunction');

    public async Extract(): Promise<unknown> {

        const regex = /scoreboard players set in mt\.(.+)_chance (\d+)/gm;
        const midFile_contents = await readFile(this.MID_FILE, 'utf-8');

        let out: Record<string, number> = {};
        let m;

        while ((m = regex.exec(midFile_contents)) !== null) {
            if (m.index === regex.lastIndex) {
                regex.lastIndex++;
            }

            let rarity = m[1];
            const chance = parseInt(m[2]);
            out[rarity] = chance;
        }

        this.writeOut(out);
        return this.passingData;
    }
}