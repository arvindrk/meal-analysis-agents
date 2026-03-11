import { writeAgentOutput, readAgentOutput } from "./utils/agentIO";
import { MealAnalysisPipeline } from "./pipeline";
import type { MealAnalysisOutput } from "./types";

const AGENT_NAMES = ["guardrail", "analysis", "safety"] as const;
type AgentName = (typeof AGENT_NAMES)[number];

const OUTPUT_DIRS: Record<AgentName, string> = {
  guardrail: "guardrailCheck",
  analysis: "mealAnalysis",
  safety: "safetyChecks",
};

function parseArgs(argv: string[]) {
  const args = argv.slice(2);
  let n: number | undefined;
  let agent: string | undefined;
  let parallel = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--n" && args[i + 1]) n = parseInt(args[i + 1], 10);
    if (args[i] === "--agent" && args[i + 1]) agent = args[i + 1];
    if (args[i] === "--parallel") parallel = true;
  }

  return { n, agent, parallel };
}

async function runSingleAgent(
  pipeline: MealAnalysisPipeline,
  agentName: AgentName,
  n?: number,
) {
  const entries = n ? pipeline.dataset.slice(0, n) : pipeline.dataset;
  const outputKey = OUTPUT_DIRS[agentName];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    console.log(`[${i + 1}/${entries.length}] ${entry.id}`);

    let output: unknown;
    switch (agentName) {
      case "guardrail":
        output = await pipeline.guardrailAgent.execute(entry.imagePath);
        break;
      case "analysis":
        output = await pipeline.mealAnalysisAgent.execute(entry.imagePath);
        break;
      case "safety": {
        let mealAnalysis: MealAnalysisOutput;
        try {
          mealAnalysis = readAgentOutput<MealAnalysisOutput>(
            "mealAnalysis",
            entry.id,
          );
        } catch (err) {
          console.warn(`\n[skip] ${entry.id}: ${(err as Error).message}`);
          continue;
        }
        output = await pipeline.safetyAgent.execute(mealAnalysis);
        break;
      }
    }

    writeAgentOutput(outputKey, entry.id, output);
    console.log(JSON.stringify(output, null, 2));
  }
}

async function runFullPipeline(pipeline: MealAnalysisPipeline, n?: number) {
  const results = await pipeline.analyzeAll(n);

  for (const result of results) {
    writeAgentOutput("guardrailCheck", result.imageId, result.guardrailCheck);
    if (result.mealAnalysis)
      writeAgentOutput("mealAnalysis", result.imageId, result.mealAnalysis);
    if (result.safetyChecks)
      writeAgentOutput("safetyChecks", result.imageId, result.safetyChecks);
  }

  console.log(JSON.stringify(results, null, 2));
}

async function main() {
  const { n, agent, parallel } = parseArgs(process.argv);
  const pipeline = new MealAnalysisPipeline({ parallel });

  if (agent) {
    if (!AGENT_NAMES.includes(agent as AgentName)) {
      console.error(`Unknown agent: ${agent}. Use: ${AGENT_NAMES.join(", ")}`);
      process.exit(1);
    }
    await runSingleAgent(pipeline, agent as AgentName, n);
  } else {
    await runFullPipeline(pipeline, n);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
