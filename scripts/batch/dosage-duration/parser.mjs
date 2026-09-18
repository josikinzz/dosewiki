import yaml from "yaml";

export function parseGeneratedYaml(response) {
  const yamlMatch = response.match(/```ya?ml\s*([\s\S]*?)```/);
  const yamlContent = yamlMatch ? yamlMatch[1].trim() : response.trim();

  try {
    const parsed = yaml.parse(yamlContent);
    if (!parsed.dosage?.routes && !parsed.duration?.routes) {
      throw new Error("Invalid response - missing dosage and duration");
    }

    return {
      dosage: parsed.dosage || { routes: [], plateau_dosing: null },
      duration: parsed.duration || { routes: [] },
    };
  } catch (error) {
    throw new Error(`Failed to parse YAML: ${error.message}`);
  }
}
