#!/usr/bin/env node

/**
 * CLI entry point for calldata decoder
 */

// Load environment variables from .env file FIRST
import "dotenv/config";

import { program } from "commander";
import { createInterface } from "readline";
import { writeFileSync } from "fs";
import { decode, decodeAndFormat, createEmptyProfile } from "../src/index.js";
import { explain, formatExplanation } from "../src/explainer.js";

program
  .name("decode")
  .description("Decode Ethereum calldata into human-understandable consequences")
  .version("1.0.0")
  .argument("[calldata]", "Raw hex calldata to decode")
  .option("--offline", "Offline mode - don't query external services")
  .option("--json", "Output as JSON instead of human-readable format")
  .option("--stdin", "Read calldata from stdin")
  .option("--explain", "Generate AI-powered plain English explanation (requires OPENROUTER_API_KEY)")
  .option("--explain-only", "Show only the AI explanation, not technical details")
  .option("--model <model>", "AI model to use for explanation (default: anthropic/claude-3-haiku)")
  .option("--target <address>", "Target contract address (for trust profile analysis)")
  .option("--profile <path>", "Path to trust profile JSON file")
  .option("--init-profile <safeAddress>", "Generate an empty trust profile template for a Safe")
  .action(async (calldata, options) => {
    try {
      // Handle --init-profile command
      if (options.initProfile) {
        const profile = createEmptyProfile(options.initProfile);
        console.log(JSON.stringify(profile, null, 2));
        return;
      }

      let input = calldata;

      // Handle stdin input
      if (options.stdin || !calldata) {
        input = await readStdin();
      }

      if (!input || !input.trim()) {
        console.error("Error: No calldata provided");
        console.error("Usage: decode <calldata> or echo <calldata> | decode --stdin");
        console.error("");
        console.error("Trust Profile Options:");
        console.error("  --target <address>       Target contract address");
        console.error("  --profile <path>         Path to trust profile JSON");
        console.error("  --init-profile <safe>    Generate empty profile template");
        process.exit(1);
      }

      // Build decode options
      const decodeOptions = {
        offline: options.offline,
        targetAddress: options.target,
        profilePath: options.profile
      };

      // If --explain or --explain-only, generate AI explanation
      if (options.explain || options.explainOnly) {
        // First decode the calldata
        const analysis = await decode(input.trim(), decodeOptions);

        // Generate explanation
        const explanationResult = await explain(analysis, {
          model: options.model
        });

        // Format and output explanation
        const explanationOutput = formatExplanation(explanationResult);

        if (options.explainOnly) {
          // Only show explanation
          console.log(explanationOutput);
        } else {
          // Show both technical output and explanation
          const technicalOutput = await decodeAndFormat(input.trim(), {
            ...decodeOptions,
            json: options.json
          });

          console.log(technicalOutput);
          console.log("");
          console.log(explanationOutput);
        }
      } else {
        // Standard output (no AI explanation)
        const output = await decodeAndFormat(input.trim(), {
          ...decodeOptions,
          json: options.json
        });

        console.log(output);
      }
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });

/**
 * Read from stdin with timeout
 */
async function readStdin() {
  return new Promise((resolve, reject) => {
    // Check if stdin is a TTY (interactive terminal)
    if (process.stdin.isTTY) {
      resolve(null);
      return;
    }

    let data = "";
    const rl = createInterface({
      input: process.stdin,
      terminal: false
    });

    // Set a timeout for reading
    const timeout = setTimeout(() => {
      rl.close();
      resolve(data || null);
    }, 1000);

    rl.on("line", (line) => {
      data += line;
    });

    rl.on("close", () => {
      clearTimeout(timeout);
      resolve(data || null);
    });

    rl.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

program.parse();
