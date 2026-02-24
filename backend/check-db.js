import prisma from './src/db/prismaClient.js';

async function checkEmbeddings() {
    try {
        const totalCount = await prisma.memoryEntry.count();
        const nullEmbeddings = await prisma.memoryEntry.count({
            where: {
                embedding: null
            }
        });

        console.log(`Total MemoryEntries: ${totalCount}`);
        console.log(`MemoryEntries with NULL embedding: ${nullEmbeddings}`);

        if (totalCount > 0) {
            // Check the dimension of the first non-null embedding
            const entry = await prisma.$queryRaw`
        SELECT length(embedding::text) as len_str, embedding::text as vec_text
        FROM "memory_entries"
        WHERE embedding IS NOT NULL
        LIMIT 1
      `;

            if ((entry as any[]).length > 0) {
                console.log('Sample vector text length:', (entry as any[])[0].len_str);
                // Parse the vector text to count dimensions
                const vecText = (entry as any[])[0].vec_text;
                const dims = vecText.replace('[', '').replace(']', '').split(',').length;
                console.log('Sample vector dimensions:', dims);
            }
        }

        const chunkTotal = await prisma.chunk.count();
        const chunkNull = await prisma.chunk.count({
            where: {
                embedding: null
            }
        });

        console.log(`Total Chunks: ${chunkTotal}`);
        console.log(`Chunks with NULL embedding: ${chunkNull}`);

    } catch (error) {
        console.error('Error checking database:', error);
    } finally {
        await prisma.$disconnect();
    }
}

checkEmbeddings();
