import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { BaseExtractor } from "../classes/BaseExtractor";
import { Jar } from "../classes/Jar";

export default class BiomesExtractor extends BaseExtractor {

    private readonly BIOMES_DIR = this.getRelativePath('data/mt/predicates/biomes');
    private readonly ANIMATION_FILES_DIR = this.getRelativePath('data/mt/functions/treasure_chest/tiers');
    private readonly ANIMATION_FILES = ["com_ani.mcfunction", "rare_ani.mcfunction", "leg_ani.mcfunction", "epic_ani.mcfunction"];


    public async Extract(): Promise<unknown> {

        let out: Record<string, string[]> = {};
        for (const file of this.ANIMATION_FILES) {
            const animationFile = await readFile(join(this.ANIMATION_FILES_DIR, file), 'utf-8');

            const minecraftMatchingRegex = /execute if biome ~ ~ ~ (?:(#minecraft:.+)) run function mt:treasure_chest\/(.+)\/(?:com|rare|epic|leg)_animation/gm;
            const mineTreasureMatchingRegex = /execute if predicate (?:(mt:biomes\/.+)) run function mt:treasure_chest\/(.+)\/(?:com|rare|epic|leg)_animation/gm;

            // Match the checks
            const matches = [...animationFile.matchAll(minecraftMatchingRegex), ...animationFile.matchAll(mineTreasureMatchingRegex)];

            for (const match of matches) {
                const predicate = match[1];
                const location = match[2];

                // Read the animation file to get the treasure that spawns after this animation
                const animationFile = this.getRelativePath(`data/mt/functions/treasure_chest/${location}/common.mcfunction`);
                const animationFileContent = await readFile(animationFile, 'utf-8');

                const regex = /mt:chests\/(.+)\/.+/gm;
                const treasureCapture = regex.exec(animationFileContent);
                if (!treasureCapture) throw new Error(`Could not find treasure in ${animationFile}`);

                const treasure = treasureCapture[1];

                // If the predicate is mine-treasure one, we can get the biomes from the biomes directory
                if (predicate.startsWith('mt:biomes')) {
                    const biomes = await this.getBiomesFromPredicate(predicate);
                    out[treasure] = biomes;
                } else {
                    const biomes = await this.getBiomesFromJar(predicate);
                    out[treasure] = biomes;
                }
            }
        }
        this.writeOut(out);
        return this.passingData;
    }

    private async getBiomesFromPredicate(predicate: string): Promise<string[]> {
        const purePredicate = predicate.replace('mt:biomes/', '');
        const predicateFile = await readFile(join(this.BIOMES_DIR, purePredicate + ".json"), 'utf-8');
        const predicateJson = JSON.parse(predicateFile);

        return predicateJson[0].terms.map((term: any) => term.predicate.biome.replace('minecraft:', '').replace(/_/g, ' '));
    }

    private async getBiomesFromJar(predicate: string): Promise<string[]> {
        const jar = Jar.open(this.getRelativePath('client.jar'));
        const purePredicate = predicate.replace('#minecraft:', '');
        const path = `data/minecraft/tags/worldgen/biome/${purePredicate}.json`;
        const predicateJson = await jar.readJson(path);

        const biomes: string[] = [];
        for (const biome of predicateJson.values) {
            if (biome.startsWith("#minecraft:")) {
                const pureBiome = biome.replace('#minecraft:', '');
                const additionalBiomes = await this.getBiomesFromJar(pureBiome);
                biomes.push(...additionalBiomes);
            } else {
                biomes.push(biome.replace('minecraft:', '').replace(/_/g, ' '));
            }
        }
        return biomes;
    }
}