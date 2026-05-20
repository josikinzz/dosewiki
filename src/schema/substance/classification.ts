import { z } from "zod";

/** Identification section */
export const identificationSchema = z.object({
  common_name: z.string(),
  substitutive_name: z.string(),
  iupac_name: z.string(),
  alternative_names: z.array(z.string()),
  smiles: z.string(),
  inchi_key: z.string(),
  cas_number: z.string(),
  molecular_formula: z.string(),
  molecular_weight: z.string(),
  skeletal_structure_image: z.string(),
  botanical_name: z.string().nullable().default(""),
});

/** Classification section */
export const classificationSchema = z.object({
  psychoactive_class: z.array(z.string()),
  chemical_class: z.array(z.string()),
});

export type Identification = z.infer<typeof identificationSchema>;
export type Classification = z.infer<typeof classificationSchema>;
