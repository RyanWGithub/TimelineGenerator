import React, { useState, useEffect } from 'react';
import { Plus, Image as ImageIcon, X } from 'lucide-react';

export default function EventForm({ onAddEvent, editingEvent, onUpdateEvent, onCancelEdit, existingEvents = [] }) {
  const [date, setDate] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [images, setImages] = useState([]);
  const [imageUrl, setImageUrl] = useState('');
  const [position, setPosition] = useState('bottom');
  const [relatedEventIds, setRelatedEventIds] = useState([]);

  useEffect(() => {
    if (editingEvent) {
      setDate(editingEvent.date);
      setTitle(editingEvent.title);
      setDescription(editingEvent.description || '');
      setPosition(editingEvent.position || 'bottom');
      
      // Handle legacy single ID or new array of IDs
      if (editingEvent.relatedEventIds && Array.isArray(editingEvent.relatedEventIds)) {
        setRelatedEventIds(editingEvent.relatedEventIds);
      } else if (editingEvent.relatedEventId) {
        setRelatedEventIds([editingEvent.relatedEventId]);
      } else {
        setRelatedEventIds([]);
      }
      
      // Handle images
      // Old format compatibility: if event has 'image' property, convert to array
      if (editingEvent.images && Array.isArray(editingEvent.images)) {
        setImages(editingEvent.images);
      } else if (editingEvent.image) {
        setImages([editingEvent.image]);
      } else {
        setImages([]);
      }
      setImageUrl('');
    } else {
      // Reset form when not editing
      setDate('');
      setTitle('');
      setDescription('');
      setImages([]);
      setImageUrl('');
      setPosition('bottom');
      setRelatedEventIds([]);
    }
  }, [editingEvent]);

  // Helper to add related event
  const addRelatedEvent = (e) => {
    const idToAdd = e.target.value;
    if (!idToAdd) return;
    
    // Prevent duplicates
    if (!relatedEventIds.includes(parseInt(idToAdd)) && !relatedEventIds.includes(idToAdd)) {
      setRelatedEventIds(prev => [...prev, idToAdd]);
    }
    
    // Reset select
    e.target.value = "";
  };

  // Helper to remove related event
  const removeRelatedEvent = (idToRemove) => {
    setRelatedEventIds(prev => prev.filter(id => id != idToRemove));
  };

  const handleImageChange = (e) => {
    const files = Array.from(e.target.files);
    
    files.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImages(prev => [...prev, reader.result]);
      };
      reader.readAsDataURL(file);
    });
    
    // Clear input so same files can be selected again if needed
    e.target.value = '';
  };

  const addImageUrl = () => {
    if (imageUrl) {
      setImages(prev => [...prev, imageUrl]);
      setImageUrl('');
    }
  };

  const removeImage = (indexToRemove) => {
    setImages(prev => prev.filter((_, index) => index !== indexToRemove));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!date || !title) return;

    const eventData = {
      id: editingEvent ? editingEvent.id : Date.now(),
      date,
      title,
      description,
      images,
      // Keep backward compatibility for now, use first image as main image
      image: images.length > 0 ? images[0] : null,
      position,
      relatedEventIds,
      // Backward compatibility
      relatedEventId: relatedEventIds.length > 0 ? relatedEventIds[0] : null,
    };

    if (editingEvent) {
      onUpdateEvent(eventData);
    } else {
      onAddEvent(eventData);
    }

    if (!editingEvent) {
      setDate('');
      setTitle('');
      setDescription('');
      setImages([]);
      setImageUrl('');
      setPosition('bottom');
      setRelatedEventIds([]);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow-md mb-8 relative">
      {editingEvent && (
        <div className="absolute top-4 right-4">
          <button 
            type="button" 
            onClick={onCancelEdit}
            className="text-gray-400 hover:text-gray-600"
            title="取消编辑"
          >
            <X size={20} />
          </button>
        </div>
      )}
      
      <h2 className="text-xl font-bold mb-4 text-gray-800">
        {editingEvent ? '编辑回忆' : '添加新回忆'}
      </h2>
      <div className="grid grid-cols-1 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">日期</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">标题</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">显示位置</label>
          <div className="mt-1 flex space-x-4">
            <label className="inline-flex items-center">
              <input
                type="radio"
                className="form-radio text-indigo-600"
                name="position"
                value="top"
                checked={position === 'top'}
                onChange={(e) => setPosition(e.target.value)}
              />
              <span className="ml-2">上方 (Top)</span>
            </label>
            <label className="inline-flex items-center">
              <input
                type="radio"
                className="form-radio text-indigo-600"
                name="position"
                value="bottom"
                checked={position === 'bottom'}
                onChange={(e) => setPosition(e.target.value)}
              />
              <span className="ml-2">下方 (Bottom)</span>
            </label>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">描述</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
            rows="3"
          />
        </div>
        
        {/* Related Event Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700">关联事件 (可选)</label>
          <select
            onChange={addRelatedEvent}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
            defaultValue=""
          >
            <option value="">-- 添加关联 --</option>
            {existingEvents
              .slice() // Create a copy to sort
              .sort((a, b) => new Date(a.date) - new Date(b.date))
              .map((event, index) => {
                // Filter out self and already selected (done inside map to keep correct index/numbering)
                if ((editingEvent && event.id === editingEvent.id) || relatedEventIds.includes(event.id) || relatedEventIds.includes(String(event.id))) {
                  return null;
                }
                return (
                  <option key={event.id} value={event.id}>
                    #{index + 1} - {event.date} - {event.title}
                  </option>
                );
              })
            }
          </select>
          
          {/* Selected Related Events Tags */}
          {relatedEventIds.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {relatedEventIds.map(id => {
                const event = existingEvents.find(e => e.id == id);
                if (!event) return null;
                
                // Find index for numbering
                const sortedAll = [...existingEvents].sort((a, b) => new Date(a.date) - new Date(b.date));
                const index = sortedAll.findIndex(e => e.id == id);
                
                return (
                  <span key={id} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                    #{index + 1} {event.title}
                    <button
                      type="button"
                      onClick={() => removeRelatedEvent(id)}
                      className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full text-indigo-400 hover:bg-indigo-200 hover:text-indigo-600 focus:outline-none"
                    >
                      <X size={10} />
                    </button>
                  </span>
                );
              })}
            </div>
          )}
          <p className="mt-1 text-xs text-gray-500">选择多个关联事件，鼠标悬停时会显示连接线。</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">图片 ({images.length} 张)</label>
          <div className="mt-1 flex items-center space-x-4 mb-3">
            <label className="cursor-pointer bg-white py-2 px-3 border border-gray-300 rounded-md shadow-sm text-sm leading-4 font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
              <span className="flex items-center">
                <ImageIcon className="h-4 w-4 mr-2" /> 上传图片
              </span>
              <input type="file" className="hidden" accept="image/*" multiple onChange={handleImageChange} />
            </label>
            <span className="text-gray-500 text-sm">或</span>
            <div className="flex-1 flex space-x-2">
              <input
                type="url"
                placeholder="https://example.com/image.jpg"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addImageUrl();
                  }
                }}
              />
              <button
                type="button"
                onClick={addImageUrl}
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                添加链接
              </button>
            </div>
          </div>
          
          {/* Image Previews */}
          {images.length > 0 && (
            <div className="grid grid-cols-4 gap-4 mt-2">
              {images.map((img, index) => (
                <div key={index} className="relative group">
                  <img src={img} alt={`Preview ${index}`} className="h-24 w-full object-cover rounded-md border border-gray-200" />
                  <button
                    type="button"
                    onClick={() => removeImage(index)}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="移除图片"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex space-x-3">
          <button
            type="submit"
            className="flex-1 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            {editingEvent ? '保存修改' : <><Plus className="h-4 w-4 mr-2" /> 添加到时间轴</>}
          </button>
          {editingEvent && (
            <button
              type="button"
              onClick={onCancelEdit}
              className="inline-flex justify-center py-2 px-4 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              取消
            </button>
          )}
        </div>
      </div>
    </form>
  );
}
