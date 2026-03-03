import React, { useState, useEffect, useRef } from 'react';
import EventForm from './components/EventForm';
import Timeline from './components/Timeline';
import { Trash2, Download, Upload } from 'lucide-react';
import { getAllEvents, saveEvent, deleteEventById, clearAllEvents, saveAllEvents } from './db';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

function App() {
  const [events, setEvents] = useState([]);
  const [editingEvent, setEditingEvent] = useState(null);
  const fileInputRef = useRef(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showConnections, setShowConnections] = useState(true);

  // Load events from IndexedDB (and migrate from localStorage if needed)
  useEffect(() => {
    const loadData = async () => {
      try {
        // 1. Try to load from DB
        const dbEvents = await getAllEvents();
        
        if (dbEvents.length > 0) {
          setEvents(dbEvents);
        } else {
          // 2. If DB is empty, check localStorage (Migration)
          const localSaved = localStorage.getItem('timeline-events');
          if (localSaved) {
            try {
              const localEvents = JSON.parse(localSaved);
              if (Array.isArray(localEvents) && localEvents.length > 0) {
                console.log('Migrating data from localStorage to IndexedDB...');
                await saveAllEvents(localEvents);
                setEvents(localEvents);
                // Optional: Clear localStorage after successful migration
                // localStorage.removeItem('timeline-events'); 
              }
            } catch (e) {
              console.error('Error parsing localStorage data', e);
            }
          }
        }
      } catch (error) {
        console.error('Failed to load events:', error);
      }
    };
    
    loadData();
  }, []);

  const addEvent = async (event) => {
    try {
      await saveEvent(event);
      setEvents(prev => [...prev, event]);
    } catch (error) {
      console.error('Failed to save event:', error);
      alert('保存失败，请重试');
    }
  };

  const updateEvent = async (updatedEvent) => {
    try {
      await saveEvent(updatedEvent);
      setEvents(events.map(event => 
        event.id === updatedEvent.id ? updatedEvent : event
      ));
      setEditingEvent(null);
    } catch (error) {
      console.error('Failed to update event:', error);
      alert('更新失败，请重试');
    }
  };

  const startEditing = (event) => {
    setEditingEvent(event);
    // Scroll to form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEditing = () => {
    setEditingEvent(null);
  };

  const deleteEvent = async (id) => {
    if (window.confirm('确定要删除这个回忆吗？')) {
      try {
        await deleteEventById(id);
        setEvents(events.filter(event => event.id !== id));
        if (editingEvent && editingEvent.id === id) {
          setEditingEvent(null);
        }
      } catch (error) {
        console.error('Failed to delete event:', error);
        alert('删除失败，请重试');
      }
    }
  };

  const clearTimeline = async () => {
    if (window.confirm('Are you sure you want to clear the entire timeline?')) {
      try {
        await clearAllEvents();
        setEvents([]);
      } catch (error) {
        console.error('Failed to clear timeline:', error);
      }
    }
  };

  const exportTimeline = async () => {
    setIsProcessing(true);
    try {
      const zip = new JSZip();
      const folderName = `timeline-export-${new Date().toISOString().slice(0, 10)}`;
      const imgFolder = zip.folder("images");
      
      // Deep copy events to avoid modifying state
      const eventsToExport = JSON.parse(JSON.stringify(events));
      
      // Process images
      for (let i = 0; i < eventsToExport.length; i++) {
        const event = eventsToExport[i];
        
        // Handle 'images' array
        if (event.images && event.images.length > 0) {
          const newImagePaths = [];
          for (let j = 0; j < event.images.length; j++) {
            const imgData = event.images[j];
            if (imgData.startsWith('data:image')) {
              // Extract base64 data
              const matches = imgData.match(/^data:image\/([a-zA-Z+]+);base64,(.+)$/);
              if (matches) {
                const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
                const filename = `event_${event.id}_${j}.${ext}`;
                imgFolder.file(filename, matches[2], {base64: true});
                newImagePaths.push(`images/${filename}`);
              } else {
                newImagePaths.push(imgData); // Keep as is if not base64
              }
            } else {
              newImagePaths.push(imgData); // Keep external URLs
            }
          }
          event.images = newImagePaths;
        }
        
        // Handle legacy single 'image'
        if (event.image && event.image.startsWith('data:image')) {
          const matches = event.image.match(/^data:image\/([a-zA-Z+]+);base64,(.+)$/);
          if (matches) {
            const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
            const filename = `event_${event.id}_main.${ext}`;
            imgFolder.file(filename, matches[2], {base64: true});
            event.image = `images/${filename}`;
          }
        }
      }
      
      // Add JSON file
      zip.file("timeline.json", JSON.stringify(eventsToExport, null, 2));
      
      // Generate and save zip
      const content = await zip.generateAsync({type: "blob"});
      saveAs(content, `${folderName}.zip`);
      
    } catch (error) {
      console.error('Export failed:', error);
      alert('导出失败，请重试');
    } finally {
      setIsProcessing(false);
    }
  };

  const importTimeline = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsProcessing(true);
    try {
      // Check if it's a ZIP file
      if (file.name.endsWith('.zip')) {
        const zip = await JSZip.loadAsync(file);
        
        // Read JSON
        const jsonFile = zip.file("timeline.json");
        if (!jsonFile) {
          throw new Error("Invalid backup: timeline.json not found in zip");
        }
        
        const jsonContent = await jsonFile.async("string");
        const importedEvents = JSON.parse(jsonContent);
        
        if (!Array.isArray(importedEvents)) {
          throw new Error("Invalid JSON format");
        }
        
        if (!window.confirm('Importing will replace your current timeline. Continue?')) {
          setIsProcessing(false);
          e.target.value = ''; // Reset input
          return;
        }
        
        // Reconstruct images
        for (const event of importedEvents) {
          // Handle 'images' array
          if (event.images && event.images.length > 0) {
            const restoredImages = [];
            for (const imgPath of event.images) {
              if (typeof imgPath === 'string' && imgPath.startsWith('images/')) {
                // It's a file in the zip
                const imgFile = zip.file(imgPath);
                if (imgFile) {
                  const blob = await imgFile.async("blob");
                  // Create Blob URL or Data URL? Data URL is safer for persistence in IndexedDB
                  const reader = new FileReader();
                  const dataUrl = await new Promise((resolve) => {
                    reader.onload = () => resolve(reader.result);
                    reader.readAsDataURL(blob);
                  });
                  restoredImages.push(dataUrl);
                } else {
                  restoredImages.push(imgPath); // File missing? Keep path
                }
              } else {
                restoredImages.push(imgPath); // External URL
              }
            }
            event.images = restoredImages;
          }
          
          // Handle legacy single 'image'
          if (event.image && typeof event.image === 'string' && event.image.startsWith('images/')) {
            const imgFile = zip.file(event.image);
            if (imgFile) {
              const blob = await imgFile.async("blob");
              const reader = new FileReader();
              const dataUrl = await new Promise((resolve) => {
                reader.onload = () => resolve(reader.result);
                reader.readAsDataURL(blob);
              });
              event.image = dataUrl;
            }
          }
        }
        
        await saveAllEvents(importedEvents);
        setEvents(importedEvents);
        
      } else if (file.name.endsWith('.json')) {
        // Fallback for old JSON-only backups
        const reader = new FileReader();
        reader.onload = async (event) => {
          try {
            const importedEvents = JSON.parse(event.target.result);
            if (Array.isArray(importedEvents)) {
              if (window.confirm('Importing will replace your current timeline. Continue?')) {
                await saveAllEvents(importedEvents);
                setEvents(importedEvents);
              }
            }
          } catch (error) {
            console.error('Error parsing JSON:', error);
            alert('Invalid JSON file');
          }
        };
        reader.readAsText(file);
      } else {
        alert('Unsupported file type. Please upload a .zip or .json file.');
      }
    } catch (error) {
      console.error('Error importing file:', error);
      alert(`Import failed: ${error.message}`);
    } finally {
      setIsProcessing(false);
      e.target.value = '';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      {/* Header & Form Section - Centered and narrow */}
      <div className="max-w-3xl mx-auto mb-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight sm:text-5xl mb-4">
            时间轴生成器
          </h1>
          <p className="text-lg text-gray-600">
            创建你自己的无限时间轴。添加日期、描述和图片。
          </p>
        </div>

        <EventForm 
          onAddEvent={addEvent} 
          editingEvent={editingEvent}
          onUpdateEvent={updateEvent}
          onCancelEdit={cancelEditing}
          existingEvents={events}
        />
      </div>

      {/* Timeline Section - Wider container for horizontal scroll */}
      <div className="max-w-[95%] mx-auto">
        <div className="bg-white p-8 rounded-lg shadow-lg">
          <div className="flex justify-between items-center mb-6 border-b pb-4">
            <h2 className="text-2xl font-bold text-gray-800">时间轴</h2>
            
            <div className="flex items-center gap-4">
              {/* Show Connections Toggle */}
              <div className="flex items-center mr-2">
                <input
                  id="showConnections"
                  type="checkbox"
                  checked={showConnections}
                  onChange={(e) => setShowConnections(e.target.checked)}
                  className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded cursor-pointer"
                />
                <label htmlFor="showConnections" className="ml-2 block text-sm text-gray-700 cursor-pointer select-none">
                  显示关联连线
                </label>
              </div>

              {/* Import Button */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={importTimeline}
                className="hidden"
                accept=".json,.zip"
              />
              <button
                onClick={() => fileInputRef.current.click()}
                disabled={isProcessing}
                className={`text-indigo-600 hover:text-indigo-800 flex items-center text-sm font-medium transition-colors ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
                title="Restore from backup"
              >
                <Upload className="w-4 h-4 mr-1" /> {isProcessing ? '导入中...' : '导入'}
              </button>

              {/* Export Button */}
              {events.length > 0 && (
                <button
                  onClick={exportTimeline}
                  disabled={isProcessing}
                  className={`text-green-600 hover:text-green-800 flex items-center text-sm font-medium transition-colors ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
                  title="Save as file"
                >
                  <Download className="w-4 h-4 mr-1" /> {isProcessing ? '导出中...' : '导出'}
                </button>
              )}

              {/* Clear Button */}
              {events.length > 0 && (
                <button
                  onClick={clearTimeline}
                  className="text-red-600 hover:text-red-800 flex items-center text-sm font-medium transition-colors"
                >
                  <Trash2 className="w-4 h-4 mr-1" /> 清空
                </button>
              )}
            </div>
          </div>
          
          <Timeline 
            events={events} 
            onDeleteEvent={deleteEvent} 
            onEditEvent={startEditing}
            showConnections={showConnections}
          />
        </div>
      </div>

      <div className="mt-8 text-center text-gray-400 text-sm">
        &copy; {new Date().getFullYear()} 时间轴生成器. 所有数据保存在本地.
      </div>
    </div>
  );
}

export default App;
