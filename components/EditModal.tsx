import React from 'react';
import TagSelector from './TagSelector';

const EditModal = ({ item, tags, onSave, onClose }) => {
  const [selectedTags, setSelectedTags] = React.useState<string[]>(
    item.tags || []
  );

  const handleSave = () => {
    onSave({
      ...item,
      tags: selectedTags,
    });
    onClose();
  };

  return (
    <div>
      <h2>Edit Item</h2>
      <TagSelector
        tags={tags}
        selectedTags={selectedTags}
        onChange={setSelectedTags}
      />
      <button onClick={handleSave}>Save</button>
      <button onClick={onClose}>Cancel</button>
    </div>
  );
};

export default EditModal;
