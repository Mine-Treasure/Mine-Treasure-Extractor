import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { BaseExtractor } from '../classes/BaseExtractor';

export default class FirstAdvancements extends BaseExtractor {
    private readonly FIRST_ADVANCEMENTS_DIR = this.getRelativePath(
        'data/mt/advancement/treasure_advancements'
    );
    private readonly ADVANCEMENT_OVERRIDES: Record<string, string> = {
        deepdark_treasure: 'deep_dark_treasure',
        soulvalley_treasure: 'soul_valley_treasure',
    };

    public async Extract(): Promise<unknown> {
        const files = await readdir(this.FIRST_ADVANCEMENTS_DIR);
        let out: Record<
            string,
            Record<string, { title: string; description: string }>
        > = {};
        const treasureFiles = files.filter((f: string) =>
            /first_(common|rare|epic|legendary)_(.+)_treasure/gm.test(f)
        );

        for (const file of treasureFiles) {
            const contents = await readFile(
                join(this.FIRST_ADVANCEMENTS_DIR, file),
                'utf-8'
            );
            const json = JSON.parse(contents);

            const match =
                /first_(common|rare|epic|legendary)_(.+_treasure)/gm.exec(file);
            if (!match) {
                continue;
            }

            const rarity = match[1];
            let treasure = match[2];
            if (this.ADVANCEMENT_OVERRIDES[treasure])
                treasure = this.ADVANCEMENT_OVERRIDES[treasure];

            if (!out[treasure]) out[treasure] = {};
            out[treasure][rarity] = {
                title: json.display.title,
                description: json.display.description,
            };
        }

        this.writeOut(out);
        return this.passingData;
    }
}
