import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { BaseExtractor } from "../classes/BaseExtractor";

export default class BiomesExtractor extends BaseExtractor {

    private readonly BIOMES_DIR = this.getRelativePath('data/mt/predicates/biomes');
    private readonly BIOME_OVERRIDES: Record<string, string> = {
        'dripstone': 'dripstone_caves_biomes.json',
        'soul_valley': 'soul_sand_valley_biome.json',
        'badlands': 'badland_biomes.json',
        'basalt': 'basalt_deltas_biome.json',
        'mushroom': 'mushroom_fields_biomes.json',
        'nether': 'nether_all_biomes.json'
    }

    public async Extract(): Promise<unknown> {

        const predicates = await readdir(this.BIOMES_DIR);
        const loot = this.passingData["loot"];
        let biomesOut: Record<string, string[]> = {};
        for (const treasure of Object.keys(loot)) {
            const t = treasure.replace('_treasure', '');
            const regex = new RegExp(`${t}_biome(s)?`, 'g');
            let biomeFile = predicates.find(c => regex.test(c));
            if (!biomeFile) {
                biomeFile = this.BIOME_OVERRIDES[t];
            }

            const json = JSON.parse(await readFile(join(this.BIOMES_DIR, biomeFile), 'utf-8'));
            const biomes = json[0].terms.map((term: any) => term.predicate.biome.replace('minecraft:', '').replace(/_/g, ' '));
            biomesOut[treasure] = biomes;
        }

        this.writeOut(biomesOut);
        return this.passingData;
    }
}