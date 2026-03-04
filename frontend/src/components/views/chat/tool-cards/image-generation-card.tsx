import { ToolCardBase, type ToolState } from './tool-card-base';
import { ImageIcon, Download, ExternalLink, ZoomIn } from 'lucide-react';
import { Button } from '@ui/components/button';

interface ImageGenerationCardProps {
    state: ToolState;
    input?: {
        prompt: string;
        aspectRatio?: string;
    };
    output?: {
        success: boolean;
        imageUrl?: string;
        prompt?: string;
        error?: string;
    };
}

export function ImageGenerationCard({ state, input, output }: ImageGenerationCardProps) {
    const isSuccess = state === 'output-available' && output?.success;
    const isError = state === 'output-error' || (state === 'output-available' && !output?.success);

    const errorMessage = output?.error || 'Failed to generate image';
    const prompt = output?.prompt || input?.prompt || 'Image generation';

    return (
        <ToolCardBase
            state={state}
            icon={<ImageIcon className="size-4" />}
            loadingText="Generating image..."
            successText="Image generated"
            errorText="Generation failed"
            errorDetails={isError ? errorMessage : undefined}
            className="max-w-md"
        >
            {isSuccess && output.imageUrl && (
                <div className="mt-3 space-y-3 animate-in fade-in duration-500">
                    <div className="group relative rounded-lg overflow-hidden border border-gray-200 bg-gray-50 shadow-sm">
                        <img
                            src={output.imageUrl}
                            alt={prompt}
                            className="w-full h-auto object-contain max-h-[400px] transition-transform duration-300 group-hover:scale-[1.02]"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                            <Button
                                variant="secondary"
                                size="sm"
                                className="h-8 w-8 p-0 rounded-full"
                                onClick={() => window.open(output.imageUrl, '_blank')}
                                title="View Full Size"
                            >
                                <ZoomIn className="size-4" />
                            </Button>
                            <Button
                                variant="secondary"
                                size="sm"
                                className="h-8 w-8 p-0 rounded-full"
                                onClick={() => {
                                    const link = document.createElement('a');
                                    link.href = output.imageUrl!;
                                    link.download = `generated-image-${Date.now()}.png`;
                                    link.click();
                                }}
                                title="Download"
                            >
                                <Download className="size-4" />
                            </Button>
                        </div>
                    </div>
                    <div className="p-2 bg-gray-50 rounded-md border border-gray-100">
                        <p className="text-xs text-gray-500 italic line-clamp-2">
                            "{prompt}"
                        </p>
                    </div>
                </div>
            )}
        </ToolCardBase>
    );
}
