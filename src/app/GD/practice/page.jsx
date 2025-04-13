'use client'
import { useState, useEffect, useRef } from 'react';

export default function GroupDiscussion() {
  const [topic, setTopic] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(300); // 5 minutes in seconds
  const [currentSpeakerIndex, setCurrentSpeakerIndex] = useState(null);
  const [isUserTurn, setIsUserTurn] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isDiscussionStarted, setIsDiscussionStarted] = useState(false);
  const [isDiscussionEnded, setIsDiscussionEnded] = useState(false);
  const [userCanSpeak, setUserCanSpeak] = useState(false);
  const [userWaitTimer, setUserWaitTimer] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [isChatOpen, setIsChatOpen] = useState(true);
  
  const chatContainerRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const synthRef = useRef(null);
  
  // Initialize SpeechSynthesis for browser audio
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Initialize speech synthesis
      synthRef.current = window.speechSynthesis;
    }
    
    return () => {
      if (userWaitTimer) {
        clearTimeout(userWaitTimer);
      }
      if (synthRef.current) {
        synthRef.current.cancel();
      }
      stopRecording();
    };
  }, []);
  
  // Initialize the discussion
  const startDiscussion = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      console.log('Initializing discussion...');
      const response = await fetch('/api/group-discusion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'initialize' })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Initialized discussion:', data);
      
      setTopic(data.topic || 'Default topic');
      setChatHistory([]);
      setTimeRemaining(data.timeRemaining || 300);
      setCurrentSpeakerIndex(data.nextSpeakerIndex !== undefined ? data.nextSpeakerIndex : 0);
      setIsUserTurn(!!data.isUserTurn);
      setUserCanSpeak(!!data.userCanSpeak);
      setIsDiscussionStarted(true);
      
      // Automatically continue the discussion
      setTimeout(() => continueDiscussion(), 500);
    } catch (error) {
      console.error('Error starting discussion:', error);
      setErrorMessage(`Failed to start discussion: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Continue the ongoing discussion
  const continueDiscussion = async (userInput = null) => {
    if (isDiscussionEnded) return;
    
    // Clear any existing user wait timer
    if (userWaitTimer) {
      clearTimeout(userWaitTimer);
      setUserWaitTimer(null);
    }
    
    setIsLoading(true);
    try {
      const requestData = {
        action: 'continue',
        topic,
        chatHistory,
        userInput,
        currentSpeakerIndex,
        timeRemaining,
        userResponded: !!userInput
      };
      
      console.log('Continue discussion request:', requestData);
      
      const response = await fetch('/api/group-discusion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Continue discussion response:', data);
      
      setChatHistory(data.chatHistory || []);
      setTimeRemaining(data.timeRemaining || timeRemaining);
      setCurrentSpeakerIndex(data.nextSpeakerIndex !== undefined ? data.nextSpeakerIndex : currentSpeakerIndex);
      setIsUserTurn(!!data.isUserTurn);
      setUserCanSpeak(!!data.userCanSpeak);
      
      if (data.status === 'completed') {
        setIsDiscussionEnded(true);
      } else if (!data.isUserTurn) {
        // If we have an audioUrl and speech synthesis is available, use it
        if (data.audioUrl && synthRef.current) {
          try {
            // Get speech parameters using the audioUrl
            const voiceId = data.audioUrl.split('/').pop().split('?')[0];
            const speechResponse = await fetch(`/api/audio/${voiceId}?text=${encodeURIComponent(data.chatHistory[data.chatHistory.length - 1].text)}`);
            
            if (speechResponse.ok) {
              const speechData = await speechResponse.json();
              
              // Use the browser's speech synthesis
              speakText(speechData.text, speechData.voiceSettings);
              
              // After speaking, handle the rest of the discussion flow
              setTimeout(() => {
                handleAudioCompletion(data);
              }, 1000); // Allow slight delay for speech to start
            } else {
              console.error('Failed to get speech parameters');
              handleAudioCompletion(data);
            }
          } catch (error) {
            console.error('Error with speech synthesis:', error);
            handleAudioCompletion(data);
          }
        } else {
          // No audio or synthesis, continue after delay
          setTimeout(() => {
            handleAudioCompletion(data);
          }, 3000);
        }
      } else {
        // It's user's turn to speak
        setUserCanSpeak(true);
      }
    } catch (error) {
      console.error('Error continuing discussion:', error);
      setErrorMessage(`Failed to continue discussion: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Use speech synthesis to speak text
  const speakText = (text, voiceSettings) => {
    if (!synthRef.current) return;
    
    // Cancel any ongoing speech
    synthRef.current.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    
    // Apply voice settings
    if (voiceSettings) {
      utterance.lang = voiceSettings.name || 'en-US';
      utterance.pitch = voiceSettings.pitch || 1;
      utterance.rate = voiceSettings.rate || 1;
      
      // Try to find a matching voice if possible
      const voices = synthRef.current.getVoices();
      const matchingVoice = voices.find(v => 
        v.lang.includes(voiceSettings.name) && 
        ((voiceSettings.gender === 'male' && v.name.toLowerCase().includes('male')) ||
         (voiceSettings.gender === 'female' && v.name.toLowerCase().includes('female')))
      );
      
      if (matchingVoice) {
        utterance.voice = matchingVoice;
      }
    }
    
    // Speak the text
    synthRef.current.speak(utterance);
  };
  
  // Handle audio completion
  const handleAudioCompletion = (data) => {
    // After agent speaks, start user opportunity timer if enabled
    if (data.userCanSpeak && data.userWaitTime > 0) {
      setUserCanSpeak(true);
      
      // Set timer for user response window
      const timer = setTimeout(() => {
        handleUserTimeExpired(data);
      }, (data.userWaitTime || 5) * 1000);
      
      setUserWaitTimer(timer);
    }
    // If no user opportunity, wait and continue
    else {
      const waitTime = data.waitTime || 3;
      setTimeout(() => {
        continueDiscussion();
      }, waitTime * 1000);
    }
  };
  
  // Handle user time expired
  const handleUserTimeExpired = async (data) => {
    if (!userCanSpeak) return; // Skip if user already finished speaking
    
    stopRecording();
    setUserCanSpeak(false);
    
    try {
      console.log('User time expired, continuing discussion...');
      // No need to make a separate API call, just continue
      continueDiscussion();
    } catch (error) {
      console.error('Error handling user time expired:', error);
      setErrorMessage(`Error: ${error.message}`);
    }
  };
  
  // Start recording user speech
  const startRecording = async () => {
    // Reset audio chunks
    audioChunksRef.current = [];
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: 'audio/webm',
      });
      
      mediaRecorderRef.current.addEventListener('dataavailable', event => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      });
      
      mediaRecorderRef.current.addEventListener('stop', async () => {
        // Process the recorded audio
        if (audioChunksRef.current.length > 0) {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          
          // Only process if we have actual audio data
          if (audioBlob.size > 0) {
            try {
              await processAudio(audioBlob);
            } catch (error) {
              console.error('Error processing audio:', error);
              setErrorMessage('Failed to process your speech');
            }
          } else {
            console.log('No audio recorded');
          }
        }
        
        // Stop all tracks in the stream
        stream.getTracks().forEach(track => track.stop());
      });
      
      // Start recording
      mediaRecorderRef.current.start();
      setIsRecording(true);
      console.log('Started recording audio');
    } catch (error) {
      console.error('Error starting recording:', error);
      setErrorMessage('Could not access microphone. Please check your browser permissions.');
    }
  };
  
  // Stop recording user speech
  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
        console.log('Stopped recording audio');
      } catch (error) {
        console.error('Error stopping recording:', error);
      }
      setIsRecording(false);
    }
  };
  
  // Process recorded audio with Google Cloud Speech API
  const processAudio = async (audioBlob) => {
    try {
      setIsLoading(true);
      
      // Send the audio blob to our API endpoint
      const response = await fetch('/api/speech-to-text', {
        method: 'POST',
        body: audioBlob
      });
      
      if (!response.ok) {
        throw new Error(`Speech-to-text API error: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Speech recognition result:', data);
      
      if (data.transcription && data.transcription.trim() !== '') {
        // Use the transcription in the discussion
        continueDiscussion(data.transcription);
      } else {
        console.log('No speech detected or empty transcription');
        continueDiscussion(); // Continue without user input
      }
    } catch (error) {
      console.error('Error in speech processing:', error);
      setErrorMessage(`Speech recognition error: ${error.message}`);
      continueDiscussion(); // Continue without user input
    } finally {
      setIsLoading(false);
    }
  };
  
  // Toggle recording state
  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
      setUserCanSpeak(false);
      
      // Clear the user wait timer
      if (userWaitTimer) {
        clearTimeout(userWaitTimer);
        setUserWaitTimer(null);
      }
    } else if (userCanSpeak || isUserTurn) {
      startRecording();
    }
  };
  
  // Format time remaining
  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
  };
  
  // Toggle chat panel
  const toggleChat = () => {
    setIsChatOpen(!isChatOpen);
  };
  
  // Scroll to bottom of chat when history updates
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatHistory]);
  
  // Countdown timer
  useEffect(() => {
    let timer;
    if (isDiscussionStarted && !isDiscussionEnded && timeRemaining > 0) {
      timer = setInterval(() => {
        setTimeRemaining(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            setIsDiscussionEnded(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    
    return () => clearInterval(timer);
  }, [isDiscussionStarted, isDiscussionEnded]);
  
  // Helper to get avatar background color
  const getAvatarColor = (speaker) => {
    if (speaker === 'You') return '#3b82f6';
    
    // Simple hash function for consistent colors
    const hash = speaker.split('').reduce((acc, char) => {
      return acc + char.charCodeAt(0);
    }, 0);
    
    const colors = [
      '#F87171', '#FB923C', '#FBBF24', '#A3E635', 
      '#34D399', '#22D3EE', '#60A5FA', '#A78BFA', '#E879F9'
    ];
    
    return colors[hash % colors.length];
  };
  
  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      {/* Google Meet style header */}
      <header className="bg-gray-800 text-white p-3 shadow-md flex justify-between items-center">
        <div className="flex items-center">
          <h1 className="text-xl font-medium ml-2">Group Discussion</h1>
        </div>
        <div className="flex items-center space-x-2">
          <div className="bg-gray-700 px-3 py-1 rounded-full text-sm flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="font-mono">{formatTime(timeRemaining)}</span>
          </div>
        </div>
      </header>
      
      {/* Main content */}
      {!isDiscussionStarted ? (
        <div className="flex flex-col items-center justify-center h-full flex-1 p-8">
          <div className="bg-gray-800 rounded-lg shadow-lg p-8 max-w-md text-white text-center">
            <h2 className="text-2xl font-semibold mb-4">Welcome to Group Discussion</h2>
            <p className="text-gray-300 mb-8">Practice your communication skills in a virtual meeting environment</p>
            <button 
              className="bg-blue-600 text-white px-8 py-3 rounded-lg font-medium hover:bg-blue-700 transition duration-200 shadow-md flex items-center justify-center w-full"
              onClick={startDiscussion} 
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Starting Meeting...
                </>
              ) : 'Join Meeting'}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 relative">
          {/* Main video conference area */}
          <div className="flex-1 flex flex-col">
            {/* Topic bar */}
            {topic && (
              <div className="bg-gray-800 border-b border-gray-700 p-3 text-white">
                <h2 className="font-medium">Topic: {topic}</h2>
              </div>
            )}
            
            {/* Video grid area */}
            <div className="flex-1 p-4 bg-gray-900 relative">
              <div className="grid grid-cols-3 gap-4 h-full">
                {/* User's video tile */}
                <div className="bg-gray-800 rounded-lg overflow-hidden flex flex-col relative shadow-lg">
                  <div className="flex-1 bg-gray-700 flex items-center justify-center">
                    <div className="w-24 h-24 rounded-full bg-blue-600 flex items-center justify-center text-white text-4xl font-bold">
                      Y
                    </div>
                  </div>
                  <div className="bg-black bg-opacity-50 p-2 absolute bottom-0 left-0 right-0 text-white flex justify-between items-center">
                    <span className="font-medium">You {isUserTurn ? '(Speaking)' : ''}</span>
                    {isUserTurn && (
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                        <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                        <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Other participants (show up to 5 from chat history) */}
                {Array.from(new Set(chatHistory.map(msg => msg.speaker)))
                  .filter(speaker => speaker !== 'You')
                  .slice(0, 5)
                  .map((speaker, index) => {
                    const isCurrentlySpeaking = !isUserTurn && 
                      chatHistory.length > 0 && 
                      chatHistory[chatHistory.length - 1].speaker === speaker;
                    
                    return (
                      <div key={index} className="bg-gray-800 rounded-lg overflow-hidden flex flex-col relative shadow-lg">
                        <div className="flex-1 bg-gray-700 flex items-center justify-center">
                          <div 
                            className="w-24 h-24 rounded-full flex items-center justify-center text-white text-4xl font-bold"
                            style={{ backgroundColor: getAvatarColor(speaker) }}
                          >
                            {speaker[0]}
                          </div>
                        </div>
                        <div className="bg-black bg-opacity-50 p-2 absolute bottom-0 left-0 right-0 text-white flex justify-between items-center">
                          <span className="font-medium">{speaker}</span>
                          {isCurrentlySpeaking && (
                            <div className="flex space-x-1">
                              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                }
              </div>
              
              {/* Error message overlay */}
              {errorMessage && (
                <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-10">
                  <div className="bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center">
                    <span>{errorMessage}</span>
                    <button 
                      onClick={() => setErrorMessage(null)}
                      className="ml-3 text-white hover:text-red-100"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </div>
            
            {/* Bottom control bar */}
            <div className="bg-gray-800 border-t border-gray-700 p-3 flex justify-between items-center">
              <div></div> {/* Empty div for spacing */}
              
              <div className="flex space-x-4">
                {/* Microphone button */}
                <button 
                  className={`w-12 h-12 rounded-full flex items-center justify-center ${
                    isRecording ? 'bg-red-600 text-white' : 'bg-gray-700 text-white hover:bg-gray-600'
                  } transition duration-200`}
                  onClick={toggleRecording}
                  disabled={!userCanSpeak && !isUserTurn}
                >
                  {isRecording ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                  )}
                </button>
                
                {/* End call button */}
                {isDiscussionStarted && !isDiscussionEnded ? (
                  <button 
                    className="bg-red-600 text-white px-4 py-2 rounded-full hover:bg-red-700 transition"
                    onClick={() => setIsDiscussionEnded(true)}
                  >
                    Leave
                  </button>
                ) : (
                  <button 
                    className="bg-blue-600 text-white px-4 py-2 rounded-full hover:bg-blue-700 transition"
                    onClick={() => {
                      setIsDiscussionStarted(false);
                      setIsDiscussionEnded(false);
                    }}
                  >
                    New Meeting
                  </button>
                )}
                
                {/* Chat toggle button */}
                <button 
                  className={`w-12 h-12 rounded-full flex items-center justify-center ${
                    isChatOpen ? 'bg-blue-600 text-white' : 'bg-gray-700 text-white hover:bg-gray-600'
                  } transition duration-200`}
                  onClick={toggleChat}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </button>
              </div>
              
              <div className="flex items-center text-white">
                {isUserTurn || userCanSpeak ? (
                  <span className="text-green-400 text-sm flex items-center">
                    <span className="w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse"></span>
                    Your turn to speak
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          
          {/* Chat panel (shown/hidden with toggle) */}
          {isChatOpen && (
            <div className="w-80 bg-gray-800 border-l border-gray-700 flex flex-col animate-slide-in">
              <div className="p-3 border-b border-gray-700 flex justify-between items-center">
                <h2 className="text-white font-medium">Discussion Chat</h2>
                <button 
                  className="text-gray-400 hover:text-white"
                  onClick={toggleChat}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
              
              <div 
                ref={chatContainerRef}
                className="flex-1 overflow-y-auto p-3 space-y-3"
              >
                {/* Chat messages */}
                {Array.isArray(chatHistory) && chatHistory.map((message, index) => (
                  <div key={index} className="text-white">
                    <div className="flex items-center mb-1">
                      <div 
                        className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold mr-2"
                        style={{ backgroundColor: getAvatarColor(message.speaker) }}
                      >
                        {message.speaker[0]}
                      </div>
                      <span className="text-sm font-medium">{message.speaker}</span>
                    </div>
                    <div className="pl-8 text-gray-300 text-sm">
                      {message.text}
                    </div>
                  </div>
                ))}
                
                {/* Loading indicator */}
                {isLoading && (
                  <div className="flex justify-center p-4">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                      <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}