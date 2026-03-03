import React, { useState, useRef, useEffect } from 'react';
import { format } from 'date-fns';
import { ZoomIn, ZoomOut, Maximize, Move, Trash2, Edit2, Search, X } from 'lucide-react';
import ImageModal from './ImageModal';

export default function Timeline({ events, onDeleteEvent, onEditEvent, showConnections = true }) {
  const [selectedImage, setSelectedImage] = useState(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [currentResultIndex, setCurrentResultIndex] = useState(-1);
  const [hoveredEventId, setHoveredEventId] = useState(null);
  
  const containerRef = useRef(null);
  const contentRef = useRef(null);
  const [connectionLines, setConnectionLines] = useState([]);

  // Memoize sorting and grouping to ensure consistency across renders and effects
  const { sortedGroups, eventIndexMap, sortedEvents } = React.useMemo(() => {
    // Sort events by date
    const sorted = [...events].sort((a, b) => new Date(a.date) - new Date(b.date));

    // Group events by date
    const grouped = sorted.reduce((acc, event) => {
      const dateStr = format(new Date(event.date), 'yyyy-MM-dd');
      if (!acc[dateStr]) {
        acc[dateStr] = { date: event.date, events: [] };
      }
      acc[dateStr].events.push(event);
      return acc;
    }, {});

    const groups = Object.values(grouped).sort((a, b) => new Date(a.date) - new Date(b.date));

    // Build map of eventId -> globalIndex (1-based)
    const indexMap = {};
    let currentIndex = 0;
    groups.forEach(group => {
      group.events.forEach(event => {
        currentIndex++;
        indexMap[event.id] = currentIndex;
      });
    });

    return { sortedGroups: groups, eventIndexMap: indexMap, sortedEvents: sorted };
  }, [events]);

  // Calculate connection lines
  useEffect(() => {
    if (!showConnections) {
      setConnectionLines([]);
      return;
    }

    const calculateLines = () => {
      if (!contentRef.current) return;
      const contentRect = contentRef.current.getBoundingClientRect();
      const newLines = [];

      // If hovering, only show relevant lines? No, user wants ALL lines shown if checkbox is checked.
      // But maybe we should highlight hovered ones.
      
      // Let's calculate ALL lines for ALL events
      const processedPairs = new Set(); // To avoid duplicate lines (A->B and B->A)

      events.forEach(event => {
        let targetIds = [];
        if (event.relatedEventIds && Array.isArray(event.relatedEventIds)) {
          targetIds = [...event.relatedEventIds];
        } else if (event.relatedEventId) {
          targetIds = [event.relatedEventId];
        }

        targetIds.forEach(targetId => {
          // Create unique key for the pair to avoid duplicates
          const pairKey = [event.id, targetId].sort().join('-');
          if (processedPairs.has(pairKey)) return;
          processedPairs.add(pairKey);

          const startEl = document.querySelector(`[data-event-id="${event.id}"]`);
          const endEl = document.querySelector(`[data-event-id="${targetId}"]`);

          if (startEl && endEl) {
            // Use offsetLeft/Top for scale-independent coordinates
            // We need to traverse up to contentRef to get relative position
            const getRelativePosition = (el) => {
              let x = 0;
              let y = 0;
              let current = el;
              // Traverse up until we hit the content container
              while (current && current !== contentRef.current) {
                x += current.offsetLeft;
                y += current.offsetTop;
                current = current.offsetParent;
              }
              return { x, y, width: el.offsetWidth, height: el.offsetHeight };
            };

            const startPos = getRelativePosition(startEl);
            const endPos = getRelativePosition(endEl);

            const x1 = startPos.x + startPos.width / 2;
            const y1 = startPos.y + startPos.height / 2;
            const x2 = endPos.x + endPos.width / 2;
            const y2 = endPos.y + endPos.height / 2;

            // Determine if this line should be highlighted
            const isHighlighted = hoveredEventId === event.id || hoveredEventId == targetId;
            
            // Calculate days difference
            const targetEvent = events.find(e => e.id == targetId);
            let daysText = '';
            if (targetEvent) {
                const diffTime = Math.abs(new Date(targetEvent.date) - new Date(event.date));
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
                daysText = `${diffDays}天`;
            }

            // Use pre-calculated consistent indices
            const sourceIndex = eventIndexMap[event.id];
            const sourceInfo = `#${sourceIndex} ${event.title}`;

            const targetIndex = eventIndexMap[targetId];
            const targetInfo = targetEvent ? `#${targetIndex} ${targetEvent.title}` : '';

            newLines.push({ 
              id: `${event.id}-${targetId}`, 
              sourceId: event.id,
              targetId: targetId,
              x1, y1, x2, y2,
              isHighlighted,
              daysText,
              sourceInfo,
              targetInfo
            });
          }
        });
      });

      setConnectionLines(newLines);
    };

    // Calculate immediately and also on animation frame to handle layout changes
    calculateLines();
    const animationFrame = requestAnimationFrame(calculateLines);
    
    return () => cancelAnimationFrame(animationFrame);

  }, [hoveredEventId, scale, position, events, showConnections, eventIndexMap]);

  // Search functionality
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setCurrentResultIndex(-1);
      return;
    }

    const results = [];
    sortedGroups.forEach((group, groupIndex) => {
      group.events.forEach((event) => {
        const query = searchQuery.toLowerCase();
        if (
          event.title.toLowerCase().includes(query) ||
          (event.description && event.description.toLowerCase().includes(query)) ||
          format(new Date(event.date), 'yyyy.MM.dd').includes(query)
        ) {
          results.push({ groupIndex, eventId: event.id });
        }
      });
    });
    setSearchResults(results);
    setCurrentResultIndex(results.length > 0 ? 0 : -1);
  }, [searchQuery, events]);

  const handleSearch = () => {
    if (searchResults.length > 0) {
      const nextIndex = (currentResultIndex + 1) % searchResults.length;
      setCurrentResultIndex(nextIndex);
      scrollToGroup(searchResults[nextIndex].groupIndex);
    }
  };

  const scrollToGroup = (groupIndex) => {
    if (!containerRef.current) return;
    
    // Calculate position to center the group
    let groupX = 200; // Initial padding
    for (let i = 0; i < groupIndex; i++) {
      groupX += 400 + getGroupPosition(i);
    }
    
    // Add half of the group width (roughly)
    groupX += 200;

    const containerWidth = containerRef.current.clientWidth;
    const containerHeight = containerRef.current.clientHeight;
    
    // Calculate new X to center the element
    // position.x = center_screen - element_x * scale
    const newX = (containerWidth / 2) - (groupX * scale);
    const newY = position.y; // Keep current Y

    setPosition({ x: newX, y: newY });
  };

  // Calculate dynamic spacing
  const getGroupPosition = (index) => {
    if (index === 0) return 0;
    
    // Base spacing between events
    const baseSpacing = 400; // 384px (w-96) + padding
    
    // Time difference factor
    const prevDate = new Date(sortedGroups[index - 1].date);
    const currDate = new Date(sortedGroups[index].date);
    const diffTime = Math.abs(currDate - prevDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    
    // Logarithmic scale for distance to avoid huge gaps for large time differences
    // Min gap is 100px, max gap added is ~500px for very long periods
    const timeSpacing = Math.log(diffDays + 1) * 50;
    
    return timeSpacing; // This will be used as margin-left
  };

  // Fit to screen initially or when events change significantly
  useEffect(() => {
    if (events.length > 0) {
      fitToScreen();
    }
  }, [events.length]);

  // Handle wheel events with non-passive listener to properly prevent default behavior
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onWheel = (e) => {
      // Always prevent default to stop page scrolling when over the timeline
      e.preventDefault();
      
      // Zoom logic - Zoom with wheel
      const zoomFactor = 0.001;
      const newScale = Math.min(Math.max(0.1, scale - e.deltaY * zoomFactor), 5);
    
    // Calculate mouse position relative to container
    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // Adjust position to zoom towards mouse
    const scaleRatio = newScale / scale;
    const newX = mouseX - (mouseX - position.x) * scaleRatio;
    const newY = mouseY - (mouseY - position.y) * scaleRatio;

    setScale(newScale);
    setPosition({ x: newX, y: newY });
  };

    container.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      container.removeEventListener('wheel', onWheel);
    };
  }, [scale, position.x]); // Re-bind when state changes to capture latest state

  const handleMouseDown = (e) => {
    // Only drag if not clicking on interactive elements
    if (e.target.closest('button') || e.target.closest('img')) return;
    
    setIsDragging(true);
    setStartPos({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    e.preventDefault();
    const newX = e.clientX - startPos.x;
    const newY = e.clientY - startPos.y;
    setPosition({ x: newX, y: newY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleZoomIn = () => {
    setScale(prev => Math.min(prev * 1.2, 5));
  };

  const handleZoomOut = () => {
    setScale(prev => Math.max(prev / 1.2, 0.1));
  };

  const fitToScreen = () => {
    if (!containerRef.current || !contentRef.current || sortedGroups.length === 0) return;
    
    const containerWidth = containerRef.current.clientWidth;
    // Estimate total width with dynamic spacing
    let totalWidth = 200; // Initial padding
    sortedGroups.forEach((_, index) => {
      totalWidth += 400 + getGroupPosition(index);
    });
    
    const newScale = Math.min((containerWidth - 100) / totalWidth, 1);
    setScale(newScale);
    // Center it
    const newX = (containerWidth - totalWidth * newScale) / 2;
    const newY = containerRef.current.clientHeight / 2 - 200 * newScale; // Center vertically roughly
    setPosition({ x: newX, y: newY });
  };

  // Handle keyboard navigation for horizontal scrolling
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;
      
      const scrollAmount = 50; // pixels to scroll per key press
      
      switch (e.key) {
        case 'ArrowLeft':
          setPosition(prev => ({ ...prev, x: prev.x + scrollAmount }));
          break;
        case 'ArrowRight':
          setPosition(prev => ({ ...prev, x: prev.x - scrollAmount }));
          break;
        case 'ArrowUp':
          setPosition(prev => ({ ...prev, y: prev.y + scrollAmount }));
          break;
        case 'ArrowDown':
          setPosition(prev => ({ ...prev, y: prev.y - scrollAmount }));
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Calculate total width for scrollbar
  const totalWidth = sortedGroups.reduce((acc, _, i) => acc + 400 + getGroupPosition(i), 200);
  const containerWidth = containerRef.current ? containerRef.current.clientWidth : 1000;
  
  // Handle scrollbar interaction
  const handleScrollbarChange = (e) => {
    const scrollPercent = e.target.value / 100;
    // Map percentage to x position
    // 0% -> x = containerWidth/2 (start visible)
    // 100% -> x = containerWidth/2 - totalWidth*scale (end visible)
    const minX = containerWidth / 2 - totalWidth * scale;
    const maxX = containerWidth / 2;
    const newX = maxX - (maxX - minX) * scrollPercent;
    
    setPosition(prev => ({ ...prev, x: newX }));
  };

  // Calculate current scroll percentage for scrollbar
  const minX = containerWidth / 2 - totalWidth * scale;
  const maxX = containerWidth / 2;
  const currentScrollPercent = maxX === minX ? 0 : Math.max(0, Math.min(100, ((maxX - position.x) / (maxX - minX)) * 100));

  return (
    <>
      <div className="relative w-full h-[600px] border border-gray-200 rounded-xl overflow-hidden bg-slate-50 shadow-inner group flex flex-col">
        
        {/* Main Content Area */}
        <div className="relative flex-grow w-full overflow-hidden">
          {/* Search Bar - Moved to top right */}
        <div className="absolute top-4 right-4 z-30 w-64">
           <div className="flex items-center bg-white/90 p-1.5 rounded-lg shadow-md backdrop-blur-sm border border-gray-200 transition-all focus-within:ring-2 focus-within:ring-indigo-500/50">
             <Search size={18} className="text-gray-400 ml-2 flex-shrink-0" />
             <input 
               type="text" 
               placeholder="搜索回忆..." 
               className="w-full bg-transparent border-none focus:ring-0 text-sm px-2 py-1 text-gray-700 placeholder-gray-400 outline-none"
               value={searchQuery}
               onChange={(e) => setSearchQuery(e.target.value)}
               onKeyDown={(e) => {
                 if (e.key === 'Enter') {
                   handleSearch();
                 }
               }}
             />
             {searchQuery && (
               <button 
                 onClick={() => {
                   setSearchQuery('');
                   setSearchResults([]);
                 }}
                 className="p-1 text-gray-400 hover:text-gray-600 rounded-full mr-1"
               >
                 <X size={14} />
               </button>
             )}
           </div>

           {/* Search Results Dropdown */}
           {searchResults.length > 0 && (
             <div className="absolute top-full right-0 mt-2 bg-white rounded-lg shadow-xl border border-gray-100 w-full max-h-60 overflow-y-auto overflow-x-hidden z-40">
               <div className="px-3 py-2 text-xs font-semibold text-gray-500 border-b border-gray-50 flex justify-between bg-gray-50 sticky top-0">
                 <span>{searchResults.length} 个结果</span>
                 {currentResultIndex >= 0 && (
                    <span>{currentResultIndex + 1}/{searchResults.length}</span>
                 )}
               </div>
               <div className="divide-y divide-gray-50">
                 {searchResults.map((result, idx) => {
                   const event = events.find(e => e.id === result.eventId);
                   if (!event) return null;
                   return (
                     <button
                       key={idx}
                       className={`w-full text-left px-4 py-2 text-sm hover:bg-indigo-50 transition-colors flex flex-col ${currentResultIndex === idx ? 'bg-indigo-50 border-l-4 border-indigo-500 pl-3' : ''}`}
                       onClick={() => {
                         setCurrentResultIndex(idx);
                         scrollToGroup(result.groupIndex);
                       }}
                     >
                       <span className="font-medium text-gray-800 truncate w-full">{event.title}</span>
                       <span className="text-xs text-gray-500 mt-0.5">{format(new Date(event.date), 'yyyy.MM.dd')}</span>
                     </button>
                   );
                 })}
               </div>
             </div>
           )}
        </div>

        {/* Controls Overlay */}
        <div className="absolute bottom-4 right-4 z-20 flex gap-2 bg-white/90 p-2 rounded-lg shadow-md backdrop-blur-sm border border-gray-200">
          <button 
            onClick={handleZoomIn}
            className="p-2 hover:bg-gray-100 rounded-md text-gray-700 transition-colors"
            title="Zoom In"
          >
            <ZoomIn size={20} />
          </button>
          
          <span className="text-xs font-mono text-gray-500 self-center min-w-[3rem] text-center select-none">
             {Math.round(scale * 100)}%
          </span>

          <button 
            onClick={handleZoomOut}
            className="p-2 hover:bg-gray-100 rounded-md text-gray-700 transition-colors"
            title="Zoom Out"
          >
            <ZoomOut size={20} />
          </button>
          <div className="w-px h-6 bg-gray-300 mx-1 self-center" />
          <button 
            onClick={fitToScreen}
            className="p-2 hover:bg-gray-100 rounded-md text-gray-700 transition-colors flex items-center gap-1"
            title="Fit to Screen"
          >
            <Maximize size={20} />
            <span className="text-xs font-medium">适应屏幕</span>
          </button>
        </div>

        {/* Instructions Overlay */}
        <div className="absolute top-4 left-4 z-20 pointer-events-none opacity-60 bg-white/80 px-3 py-1 rounded text-xs text-gray-500 flex items-center gap-2 shadow-sm border border-gray-100">
           <Move size={14} /> 
           <span>滚轮缩放 • 拖拽移动</span>
        </div>

        {/* Zoomable Container */}
        <div 
          ref={containerRef}
          className={`w-full h-full cursor-grab active:cursor-grabbing ${isDragging ? 'cursor-grabbing' : ''}`}
          // Wheel event is handled by useEffect
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          tabIndex={0}
        >
          <div 
            ref={contentRef}
            className="flex items-center h-full px-20 absolute top-0 left-0 transition-transform duration-75 ease-out origin-left will-change-transform"
            style={{ 
              transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
              // Dynamic width calculation
              width: `${sortedGroups.reduce((acc, _, i) => acc + 400 + getGroupPosition(i), 200)}px` 
            }}
          >
            {/* Continuous Timeline Line */}
            {sortedEvents.length > 0 && (
              <div 
                className="absolute top-1/2 left-20 right-20 h-1.5 bg-gray-300 rounded-full shadow-sm z-0"
                style={{ transform: 'translateY(-50%)' }}
              />
            )}

            {/* Connection Line SVG Layer */}
            <svg className="absolute top-0 left-0 w-full h-full pointer-events-none z-20 overflow-visible">
              <defs>
                <marker id="arrowhead-highlight" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                  <polygon points="0 0, 10 3.5, 0 7" fill="#6366f1" />
                </marker>
                <marker id="arrowhead-normal" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                  <polygon points="0 0, 10 3.5, 0 7" fill="#a5b4fc" />
                </marker>
              </defs>
              {connectionLines.map(line => (
                <path
                  key={line.id}
                  d={`M ${line.x1} ${line.y1} C ${(line.x1 + line.x2) / 2} ${line.y1}, ${(line.x1 + line.x2) / 2} ${line.y2}, ${line.x2} ${line.y2}`}
                  stroke={line.isHighlighted ? "#6366f1" : "#a5b4fc"}
                  strokeWidth={line.isHighlighted ? "3" : "1.5"}
                  strokeDasharray={line.isHighlighted ? "10,5" : "5,5"}
                  fill="none"
                  markerStart={line.isHighlighted ? "url(#arrowhead-highlight)" : "url(#arrowhead-normal)"}
                  markerEnd={line.isHighlighted ? "url(#arrowhead-highlight)" : "url(#arrowhead-normal)"}
                  className={`transition-all duration-300 ${line.isHighlighted ? 'animate-pulse' : ''}`}
                  opacity={line.isHighlighted ? 1 : 0.6}
                />
              ))}
            </svg>

            {/* Connection Labels Layer (HTML) */}
            <div className="absolute top-0 left-0 w-full h-full pointer-events-none z-30">
              {connectionLines.map(line => {
                const midX = (line.x1 + line.x2) / 2;
                const midY = (line.y1 + line.y2) / 2 - 20;
                
                return (
                  <React.Fragment key={line.id}>
                    {/* Target Info Label at source (Start of line) */}
                    {line.targetInfo && (
                      <div 
                        className={`absolute transition-opacity duration-300 ${line.isHighlighted ? 'opacity-100 z-40' : 'opacity-0'}`}
                        style={{ 
                          left: line.x1, 
                          top: line.y1 - 25, 
                          transform: 'translate(-50%, -50%)' 
                        }}
                      >
                        <div className={`px-2 py-1 rounded-md text-xs shadow-md whitespace-nowrap border flex items-center gap-1 ${line.isHighlighted ? 'bg-white border-indigo-500 text-indigo-700' : 'bg-white border-indigo-200 text-gray-600'}`}>
                          <span className="text-xs text-gray-400">前往</span>
                          <span className="font-medium">{line.targetInfo}</span>
                          {line.daysText && <span className="text-[10px] bg-indigo-50 px-1 rounded text-indigo-600 ml-1">{line.daysText}</span>}
                        </div>
                        {/* Triangle pointer */}
                        <div 
                          className="absolute left-1/2 bottom-0 w-2 h-2 bg-white border-b border-r border-indigo-500 transform -translate-x-1/2 translate-y-1/2 rotate-45"
                          style={{ borderColor: line.isHighlighted ? '#6366f1' : '#e0e7ff' }}
                        />
                      </div>
                    )}

                    {/* Source Info Label at target (End of line) */}
                    {line.sourceInfo && (
                      <div 
                        className={`absolute transition-opacity duration-300 ${line.isHighlighted ? 'opacity-100 z-40' : 'opacity-0'}`}
                        style={{ 
                          left: line.x2, 
                          top: line.y2 - 25, 
                          transform: 'translate(-50%, -50%)' 
                        }}
                      >
                        <div className={`px-2 py-1 rounded-md text-xs shadow-md whitespace-nowrap border flex items-center gap-1 ${line.isHighlighted ? 'bg-white border-indigo-500 text-indigo-700' : 'bg-white border-indigo-200 text-gray-600'}`}>
                          <span className="text-xs text-gray-400">来自</span>
                          <span className="font-medium">{line.sourceInfo}</span>
                          {line.daysText && <span className="text-[10px] bg-indigo-50 px-1 rounded text-indigo-600 ml-1">{line.daysText}</span>}
                        </div>
                        {/* Triangle pointer */}
                        <div 
                          className="absolute left-1/2 bottom-0 w-2 h-2 bg-white border-b border-r border-indigo-500 transform -translate-x-1/2 translate-y-1/2 rotate-45"
                          style={{ borderColor: line.isHighlighted ? '#6366f1' : '#e0e7ff' }}
                        />
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>

            {sortedGroups.map((group, groupIndex) => {
              const marginLeft = getGroupPosition(groupIndex);
              
              // Determine dot color based on events in the group
              const hasTop = group.events.some(e => e.position === 'top');
              const hasBottom = group.events.some(e => e.position === 'bottom' || !e.position);
              
              let dotClass = 'border-indigo-500'; // Default (bottom only)
              if (hasTop && hasBottom) {
                dotClass = 'border-t-pink-500 border-l-pink-500 border-b-indigo-500 border-r-indigo-500 rotate-45';
              } else if (hasTop) {
                dotClass = 'border-pink-500';
              }

              return (
              <div 
                key={groupIndex} 
                className="relative w-96 flex-shrink-0 px-4 group/item select-none h-full flex flex-col justify-center"
                style={{ marginLeft: `${marginLeft}px` }}
              >
                {/* Dot on the timeline - Shared by all events in this group */}
                <div className={`absolute top-1/2 left-1/2 -ml-3 -mt-3 bg-white border-4 rounded-full w-6 h-6 z-10 shadow-sm ${dotClass}`} />
                
                {group.events.map((event, eventIndex) => {
                  const isTop = event.position === 'top';
                  
                  // Calculate global index for this event
                  let globalIndex = 0;
                  for (let i = 0; i < groupIndex; i++) {
                    globalIndex += sortedGroups[i].events.length;
                  }
                  globalIndex += eventIndex + 1;
                  
                  return (
                    /* Content Card */
                    <div 
                      key={event.id}
                      data-event-id={event.id}
                      onMouseEnter={() => setHoveredEventId(event.id)}
                      onMouseLeave={() => setHoveredEventId(null)}
                      className={`absolute left-1/2 -translate-x-1/2 bg-white p-6 rounded-lg shadow-md flex flex-col transform transition-transform hover:scale-105 hover:shadow-lg w-[22rem] group/card h-auto z-10
                        ${isTop ? 'bottom-1/2 mb-8 origin-bottom border-2 border-pink-300' : 'top-1/2 mt-8 origin-top border-2 border-indigo-300'}
                        ${
                          (hoveredEventId === event.id) || 
                          (connectionLines.some(line => line.id === event.id)) 
                          ? 'ring-2 ring-indigo-400 shadow-xl' : ''
                        }
                      `}
                    >
                      {/* Delete Button - Visible on hover */}
                      <div className="absolute top-2 right-2 flex space-x-1 opacity-0 group-hover/card:opacity-100 transition-all z-20">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditEvent(event);
                          }}
                          className="p-1.5 rounded-full text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                          title="编辑此回忆"
                          onMouseDown={(e) => e.stopPropagation()} 
                        >
                          <Edit2 size={16} />
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteEvent(event.id);
                          }}
                          className="p-1.5 rounded-full text-gray-400 hover:text-red-600 hover:bg-red-50"
                          title="删除此回忆"
                          onMouseDown={(e) => e.stopPropagation()} 
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
    
                      {/* Date - Conditional positioning */}
                      {/* Bottom event: Date at top (default) */}
                      {!isTop && (
                        <>
                          <div className="flex items-center justify-center mb-2 gap-2">
                            <span className="bg-indigo-100 text-indigo-700 text-xs font-bold px-2 py-0.5 rounded-full">#{globalIndex}</span>
                            <span className={`text-sm font-bold uppercase tracking-wider text-center text-indigo-600`}>
                              {format(new Date(event.date), 'yyyy.MM.dd')}
                            </span>
                          </div>
                          <h3 className={`text-xl font-bold text-gray-900 text-center flex items-center justify-center line-clamp-2 ${!event.images?.length && !event.image && !event.description ? '' : 'mb-4'}`}>
                            {event.title}
                          </h3>
                        </>
                      )}
                      
                      {/* For Top events: Title comes later (at bottom, before date) */}
                      
                      {event.images && event.images.length > 0 && (
                        <div className="space-y-2 mb-4">
                          {event.images.map((img, imgIndex) => (
                            <div 
                              key={imgIndex}
                              className="w-full rounded-md cursor-zoom-in bg-gray-50 flex items-center justify-center relative group/image"
                              onClick={(e) => {
                                e.stopPropagation(); 
                                setSelectedImage({ src: img, alt: event.title });
                              }}
                              onMouseDown={(e) => e.stopPropagation()} 
                            >
                              <img 
                                src={img} 
                                alt={`${event.title} ${imgIndex + 1}`} 
                                className="w-full h-auto max-h-64 object-contain rounded-md transition-transform duration-300 group-hover/image:scale-[1.02]"
                                draggable={false}
                              />
                              <div className="absolute inset-0 bg-black/0 group-hover/image:bg-black/10 transition-colors flex items-center justify-center rounded-md">
                                <ZoomIn className="text-white opacity-0 group-hover/image:opacity-100 drop-shadow-md" />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {/* Backward compatibility for single image */}
                      {!event.images && event.image && (
                        <div 
                          className="w-full mb-4 rounded-md cursor-zoom-in bg-gray-50 flex items-center justify-center relative group/image"
                          onClick={(e) => {
                            e.stopPropagation(); 
                            setSelectedImage({ src: event.image, alt: event.title });
                          }}
                          onMouseDown={(e) => e.stopPropagation()} 
                        >
                          <img 
                            src={event.image} 
                            alt={event.title} 
                            className="w-full h-auto max-h-64 object-contain rounded-md transition-transform duration-300 group-hover/image:scale-[1.02]"
                            draggable={false}
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover/image:bg-black/10 transition-colors flex items-center justify-center rounded-md">
                            <ZoomIn className="text-white opacity-0 group-hover/image:opacity-100 drop-shadow-md" />
                          </div>
                        </div>
                      )}
                      
                      {event.description && (
                        <div className="flex-grow">
                          <p className="text-gray-600 whitespace-pre-wrap text-sm leading-relaxed">
                            {event.description}
                          </p>
                        </div>
                      )}

                      {/* Top event: Title then Date at bottom */}
                      {isTop && (
                        <>
                          <h3 className={`text-xl font-bold text-gray-900 text-center flex items-center justify-center line-clamp-2 mt-4`}>
                            {event.title}
                          </h3>
                          <div className="flex items-center justify-center mt-2 pt-2 border-t border-gray-100 gap-2">
                            <span className="bg-pink-100 text-pink-700 text-xs font-bold px-2 py-0.5 rounded-full">#{globalIndex}</span>
                            <span className={`text-sm font-bold uppercase tracking-wider text-center text-pink-600`}>
                              {format(new Date(event.date), 'yyyy.MM.dd')}
                            </span>
                          </div>
                        </>
                      )}
                      
                      {/* Connecting line to dot */}
                      <div 
                        className={`absolute left-1/2 w-0.5 h-8 -ml-px
                          ${isTop ? '-bottom-8 bg-pink-300' : '-top-8 bg-indigo-300'}
                        `}
                      />
                    </div>
                  );
                })}
              </div>
            );
            })}
            
            {events.length === 0 && (
            <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 text-center text-gray-400 italic pointer-events-none">
              <p className="text-lg">时间轴是空的</p>
              <p className="text-sm mt-2">在上方添加你的第一个回忆吧</p>
            </div>
          )}
          </div>
        </div>
      </div>

      {/* Horizontal Scrollbar */}
      <div className="mt-2 px-4 flex items-center gap-2">
        <input
          type="range"
          min="0"
          max="100"
          step="0.1"
          value={currentScrollPercent || 0}
          onChange={handleScrollbarChange}
          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600 hover:accent-indigo-700 transition-all"
        />
      </div>
      </div>

      {/* Image Modal */}
      {selectedImage && (
        <ImageModal 
          src={selectedImage.src} 
          alt={selectedImage.alt} 
          onClose={() => setSelectedImage(null)} 
        />
      )}
    </>
  );
}