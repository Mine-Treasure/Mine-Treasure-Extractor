import { BaseExtractor } from '../classes/BaseExtractor';
import { readFile } from 'fs/promises';

export default class Default_ChancesExtractor extends BaseExtractor {
    private readonly MID_FILE = this.getRelativePath(
        '/data/mt/functions/settings/rates/standard.mcfunction'
    );

    public async Extract(): Promise<unknown> {
        /*
        execute store result storage mt:rates common int 1 run scoreboard players set #var mt.const 800
execute store result storage mt:rates rare int 1 run scoreboard players set #var mt.const 3200
execute store result storage mt:rates epic int 1 run scoreboard players set #var mt.const 25600
execute store result storage mt:rates legendary int 1 run scoreboard players set #var mt.const 51200
*/
        const regex =
            /execute store result storage mt:rates (common|rare|epic|legendary) int 1 run scoreboard players set #var mt\.const (\d+)/gm;
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
