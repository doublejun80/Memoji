import React, { useState, useEffect } from 'react';
import { Block } from './Block';
import { SlashMenu } from './SlashMenu';
import { Block as BlockType, BlockType as BType, Page } from '../types';
import { storage } from '../utils/storage';

interface EditorProps {
  currentPage: Page | null;
}

export const Editor: React.FC<EditorProps> = ({ currentPage }) => {
  const [blocks, setBlocks] = useState<BlockType[]>([]);
  const [slashMenu, setSlashMenu] = useState<{
    isOpen: boolean;
    position: { x: number; y: number };
    blockId: string | null;
  }>({
    isOpen: false,
    position: { x: 0, y: 0 },
    blockId: null
  });

  useEffect(() => {
    if (currentPage) {
      const pageBlocks = storage.getBlocksByPageId(currentPage.id);
      setBlocks(pageBlocks);
      
      // Create an initial block if page is empty
      if (pageBlocks.length === 0) {
        const initialBlock: BlockType = {
          id: storage.generateId(),
          pageId: currentPage.id,
          type: 'paragraph',
          content: { text: '' },
          ordering: 0
        };
        storage.saveBlock(initialBlock);
        setBlocks([initialBlock]);
      }
    } else {
      setBlocks([]);
    }
  }, [currentPage]);

  const updateBlock = (updatedBlock: BlockType) => {
    setBlocks(blocks.map(block => 
      block.id === updatedBlock.id ? updatedBlock : block
    ));
    storage.saveBlock(updatedBlock);
  };

  const deleteBlock = (blockId: string) => {
    if (blocks.length <= 1) return; // Keep at least one block
    
    setBlocks(blocks.filter(block => block.id !== blockId));
    storage.deleteBlock(blockId);
  };

  const addNewBlock = (afterBlockId: string, type: BType = 'paragraph') => {
    if (!currentPage) return;

    const afterBlockIndex = blocks.findIndex(b => b.id === afterBlockId);
    const newOrdering = afterBlockIndex >= 0 ? blocks[afterBlockIndex].ordering + 0.1 : blocks.length;

    const newBlock: BlockType = {
      id: storage.generateId(),
      pageId: currentPage.id,
      type,
      content: { text: '' },
      ordering: newOrdering
    };

    const newBlocks = [...blocks, newBlock].sort((a, b) => a.ordering - b.ordering);
    setBlocks(newBlocks);
    storage.saveBlock(newBlock);
  };

  const handleSlashCommand = (blockId: string, position: { x: number; y: number }) => {
    setSlashMenu({
      isOpen: true,
      position,
      blockId
    });
  };

  const handleSlashMenuSelect = (type: BType) => {
    if (slashMenu.blockId) {
      const block = blocks.find(b => b.id === slashMenu.blockId);
      if (block) {
        const updatedBlock = {
          ...block,
          type,
          content: { text: '' }
        };
        updateBlock(updatedBlock);
      }
    }
    setSlashMenu({ isOpen: false, position: { x: 0, y: 0 }, blockId: null });
  };

  if (!currentPage) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl text-muted-foreground mb-2">선택된 페이지가 없습니다</h2>
          <p className="text-sm text-muted-foreground">
            사이드바에서 페이지를 선택하거나 새 페이지를 만들어 보세요
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Page Header */}
      <div className="p-6 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{currentPage.icon}</span>
          <h1 className="text-2xl">{currentPage.title}</h1>
        </div>
      </div>

      {/* Editor Area */}
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="max-w-4xl mx-auto">
          {blocks.map((block) => (
            <Block
              key={block.id}
              block={block}
              onUpdate={updateBlock}
              onDelete={() => deleteBlock(block.id)}
              onNewBlock={(type) => addNewBlock(block.id, type)}
              onSlashCommand={(position) => handleSlashCommand(block.id, position)}
            />
          ))}
        </div>
      </div>

      {/* Slash Menu */}
      <SlashMenu
        isOpen={slashMenu.isOpen}
        position={slashMenu.position}
        onSelect={handleSlashMenuSelect}
        onClose={() => setSlashMenu({ isOpen: false, position: { x: 0, y: 0 }, blockId: null })}
      />
    </div>
  );
};