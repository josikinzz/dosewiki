export async function importEffectsInBatches({
  client,
  mutation,
  effects,
  batchSize,
  onBatchStart,
  onBatchComplete,
  onBatchError,
}) {
  let totalCreated = 0;
  let totalUpdated = 0;
  const allErrors = [];

  for (let index = 0; index < effects.length; index += batchSize) {
    const batch = effects.slice(index, index + batchSize);
    const batchNumber = Math.floor(index / batchSize) + 1;
    const totalBatches = Math.ceil(effects.length / batchSize);
    onBatchStart?.({ batch, batchNumber, totalBatches });

    try {
      const result = await client.mutation(mutation, { effects: batch });
      totalCreated += result.created;
      totalUpdated += result.updated;
      allErrors.push(...result.errors);
      onBatchComplete?.({ result, batchNumber, totalBatches });
    } catch (error) {
      allErrors.push(`Batch ${batchNumber}: ${error.message}`);
      onBatchError?.({ error, batchNumber, totalBatches });
    }
  }

  return { totalCreated, totalUpdated, allErrors };
}
