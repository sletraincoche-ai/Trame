import { RuleBasedEngine } from "../RuleBasedEngine";
import { defineClarificationEngineContractTests } from "./clarificationEngine.contract";

defineClarificationEngineContractTests(() => new RuleBasedEngine());
