import React from 'react';

type TagSelectorProps = {
  tags: string[];
  selectedTags: string[];
  onChange: (selected: string[]) => void;
};

const TagSelector: React.FC<TagSelectorProps> = ({
  tags,
  selectedTags,
  onChange,
}) => {
  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      onChange(selectedTags.filter((t) => t !== tag));
    } else {
      onChange([...selectedTags, tag]);
    }
  };

  return (
    <div>
      {tags.map((tag) => (
        <span
          key={tag}
          onClick={() => toggleTag(tag)}
          style={{
            margin: '0 8px 8px 0',
            padding: '4px 12px',
            borderRadius: '16px',
            cursor: 'pointer',
            background: selectedTags.includes(tag) ? '#0070f3' : '#eaeaea',
            color: selectedTags.includes(tag) ? '#fff' : '#333',
            border: selectedTags.includes(tag)
              ? '2px solid #0070f3'
              : '2px solid #eaeaea',
            userSelect: 'none',
          }}
        >
          {tag}
        </span>
      ))}
    </div>
  );
};

export default TagSelector;
