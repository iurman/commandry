import { fileURLToPath } from "node:url";
import SwaggerParser from "@apidevtools/swagger-parser";

const path = fileURLToPath(new URL("../openapi/openapi.json", import.meta.url));
await SwaggerParser.validate(path);
console.log("Generated OpenAPI document is valid.");
