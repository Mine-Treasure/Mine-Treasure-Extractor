import { join } from "path";
import { Extractor } from "./classes/Extractor.js";

const extractor = new Extractor(join(__dirname, "./extractions"), join(__dirname, '../pack'), join(__dirname, '../out'));
extractor.start();