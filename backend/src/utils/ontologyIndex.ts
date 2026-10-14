import rpaOperationsOntology from "../resources/rpa-operations.json";

const RPA_IRI =
  "http://www.semanticweb.org/maximilian.voelker/ontologies/rpa-operations#";
const INDIVIDUAL_IRI = "http://www.w3.org/2002/07/owl#NamedIndividual";

export interface OntologyIndividual {
  id: string;
  iri: string;
  /** Class of the individual, e.g. "click-button" for BrowserClickButton. */
  concept: string;
  /** Software the operation automates, e.g. "Browser" or "MicrosoftExcel". */
  automates?: string;
  /** BPMO concept, e.g. "AtomicActivity", "ExclusiveGateway", "CompoundActivity". */
  bpmoConcept?: string;
}

interface JsonLdNode {
  "@id": string;
  "@type"?: string[];
  [property: string]: unknown;
}

function firstValue(node: JsonLdNode, property: string): string | undefined {
  const values = node[RPA_IRI + property] as
    | { "@id"?: string; "@value"?: string }[]
    | undefined;
  if (!values || values.length === 0) {
    return undefined;
  }
  const value = values[0]["@id"] ?? values[0]["@value"];
  return value?.replace(RPA_IRI, "");
}

function buildIndex(): Record<string, OntologyIndividual> {
  const index: Record<string, OntologyIndividual> = {};
  for (const node of rpaOperationsOntology as JsonLdNode[]) {
    const types = node["@type"] || [];
    if (!types.includes(INDIVIDUAL_IRI) || !node["@id"].startsWith(RPA_IRI)) {
      continue;
    }
    const concept = types.find((type) => type.startsWith(RPA_IRI));
    const id = node["@id"].replace(RPA_IRI, "");
    index[id] = {
      id,
      iri: node["@id"],
      concept: concept ? concept.replace(RPA_IRI, "") : "",
      automates: firstValue(node, "automates"),
      bpmoConcept: firstValue(node, "bpmoConcept"),
    };
  }
  return index;
}

/** All named individuals of the RPA operations ontology, by id (e.g. "BrowserClickButton"). */
export const ontologyIndividuals: Record<string, OntologyIndividual> =
  buildIndex();

/** True for individuals that can label a process tree node: operations, decisions and context containers. */
export function isOntologyOperation(id: string): boolean {
  const individual = ontologyIndividuals[id];
  return (
    !!individual &&
    !!individual.bpmoConcept &&
    !["DataStore", "DataObject"].includes(individual.bpmoConcept)
  );
}
