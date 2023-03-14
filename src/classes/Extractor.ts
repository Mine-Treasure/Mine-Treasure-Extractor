import chalk from "chalk";
import { readdir } from "fs/promises";
import { join } from "path";
import Logger from "./Logger.js";

export class Extractor {

    private extractionsDir: string;
    private packDir: string;
    private outDir: string;
    private logger = new Logger();

    constructor(extractionsDir: string, packDir: string, outDir: string) {
        this.extractionsDir = extractionsDir;
        this.packDir = packDir;
        this.outDir = outDir;
        this.logger.prefix = chalk.bold.yellow("EXTRACTOR");
    }

    public async start() {
        const files = await readdir(this.extractionsDir);
        const extractors = [];

        let passingData = {};
        for (const file of files) {
            const extractor = require(join(this.extractionsDir, file));
            const instance = new extractor.default(file.split(".")[0], this.packDir, this.outDir, passingData, this);
            extractors.push({ file: file, instance });
        }

        extractors.sort((a, b) => b.instance.priority - a.instance.priority);
        for (const { file, instance } of extractors) {
            const started = Date.now()
            try {
                passingData = await instance.Extract();
            } catch (exception) {
                this.logger.error(chalk.bold.red(""), chalk.bold.blueBright(file), "failed to extract with exception:", exception);
                continue;
            }
            const ended = Date.now();
            this.logger.info(chalk.bold.green(""), chalk.bold.blueBright(file), "extracted in", chalk.bold.rgb(255, 127, 0)((ended - started) + "ms"))
        }
    }

    public async warning(...args: any[]) {
        const script = Logger.getLineAndChar(7)[0];
        this.logger.warn(chalk.bold.yellow("!"), chalk.bold.blueBright(script), ...args);;
    }
}