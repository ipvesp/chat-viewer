'use client';

import { useState, useRef, DragEvent, ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import JSZip from 'jszip';
import { saveMediaFiles, clearAllData } from '../lib/indexedDb';

export default function FileUpload() {
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const handleDrag = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = async (e: ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      await handleFile(e.target.files[0]);
    }
  };

  const simulateProgress = () => {
    setLoading(true);
    setUploadProgress(0);

    const interval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 98) {
          clearInterval(interval);
          return 99;
        }
        return prev + Math.floor(Math.random() * 5) + 1;
      });
    }, 150);

    return () => clearInterval(interval);
  };

  const readFileChunked = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const chunkSize = 1024 * 1024; // 1MB
      const fileSize = file.size;
      let offset = 0;
      let result = '';

      setProcessingMessage('Dosya okunuyor...');

      const chunkReaderBlock = (_offset: number) => {
        const fileReader = new FileReader();
        const blob = file.slice(_offset, Math.min(_offset + chunkSize, fileSize));

        fileReader.onload = (e) => {
          if (e.target?.result) {
            result += e.target.result;
          }

          offset += chunkSize;
          const progress = Math.min(Math.round((offset / fileSize) * 100), 99);

          // İlerleme durumunu güncelle
          setUploadProgress(progress);

          if (offset < fileSize) {
            // Daha fazla veri varsa okumaya devam et
            setProcessingMessage(`Dosya okunuyor... (${progress}%)`);
            chunkReaderBlock(offset);
          } else {
            // Dosya tamamen okunduğunda
            setUploadProgress(100);
            setProcessingMessage('Sohbet verisi işleniyor...');
            resolve(result);
          }
        };

        fileReader.onerror = (err) => {
          reject(err);
        };

        fileReader.readAsText(blob);
      };

      // İlk chunk'ı okumaya başla
      chunkReaderBlock(0);
    });
  };

  // Zip dosyasını işleme fonksiyonu
  const processZipFile = async (file: File): Promise<{ chatText: string, mediaFiles: Record<string, string> }> => {
    try {
      setProcessingMessage('Zip dosyası açılıyor...');

      // JSZip ile dosyayı yükle
      const zip = new JSZip();
      const zipData = await zip.loadAsync(file);

      let chatText = '';
      const mediaFiles: Record<string, string> = {};
      let foundChatFile = false;
      let processedFiles = 0;
      const totalFiles = Object.keys(zipData.files).length;

      // Zip içeriğini işle
      for (const [filename, zipEntry] of Object.entries(zipData.files)) {
        if (zipEntry.dir) continue;

        processedFiles++;
        const progress = Math.round((processedFiles / totalFiles) * 100);
        setUploadProgress(progress);

        // Dosya adını küçük harfe çevir (uzantı karşılaştırması için)
        const lowercaseFilename = filename.toLowerCase();

        if (lowercaseFilename.endsWith('.txt') && !foundChatFile) {
          setProcessingMessage(`Sohbet dosyası işleniyor: ${filename}`);
          chatText = await zipEntry.async('string');
          foundChatFile = true;
        }
        // Desteklenen medya türleri
        else if (
          lowercaseFilename.endsWith('.jpg') ||
          lowercaseFilename.endsWith('.jpeg') ||
          lowercaseFilename.endsWith('.png') ||
          lowercaseFilename.endsWith('.gif') ||
          lowercaseFilename.endsWith('.mp4') ||
          lowercaseFilename.endsWith('.webp')
        ) {
          setProcessingMessage(`Medya işleniyor: ${filename}`);

          // Medya dosyasını base64 formatında al
          const data = await zipEntry.async('blob');

          // FileReader ile blob'u base64'e çevir
          const reader = new FileReader();
          const base64Data: string = await new Promise((resolve) => {
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(data);
          });

          // Dosya adını anahtar olarak sakla
          const fileKey = filename.replace(/^.*[\\\/]/, ''); // Dosya yolundan sadece dosya adını al
          mediaFiles[fileKey] = base64Data;
        }
      }

      if (!foundChatFile) {
        throw new Error('Zip dosyasında sohbet metni (.txt dosyası) bulunamadı.');
      }

      setProcessingMessage('Medya dosyaları işleniyor...');
      return { chatText, mediaFiles };
    } catch (error) {
      console.error('Zip dosyası işlenirken hata oluştu:', error);
      throw new Error('Zip dosyası işlenirken bir hata oluştu. Lütfen geçerli bir WhatsApp sohbet yedeği zip dosyası yükleyin.');
    }
  };

  const handleFile = async (file: File) => {
    setError(null);
    const fileExtension = file.name.split('.').pop()?.toLowerCase();

    if (fileExtension !== 'txt' && fileExtension !== 'zip') {
      setError('Lütfen sadece .txt veya .zip dosyası yükleyin');
      return;
    }

    // Dosya yükleme progress simülasyonu
    const stopProgress = simulateProgress();

    try {
      setIsProcessing(true);

      let fileContent = '';
      let mediaFiles: Record<string, string> = {};

      if (fileExtension === 'zip') {
        setProcessingMessage('Zip dosyası işleniyor...');
        const zipResult = await processZipFile(file);
        fileContent = zipResult.chatText;
        mediaFiles = zipResult.mediaFiles;
      } else {
        // Normal .txt dosyası
        fileContent = await readFileChunked(file);
      }

      setProcessingMessage('Sohbet verisi analiz ediliyor...');

      // Analiz için timeout ekleyelim
      setTimeout(async () => {
        try {
          // Önce eski medya verilerini temizle
          await clearAllData();

          // Temel sohbet bilgilerini localStorage'a kaydet
          localStorage.setItem('whatsapp_chat_data', fileContent);
          localStorage.setItem('whatsapp_chat_name', file.name);
          localStorage.setItem('whatsapp_chat_type', fileExtension || '');

          // Medya dosyalarını IndexedDB'ye kaydet
          if (Object.keys(mediaFiles).length > 0) {
            setProcessingMessage('Medya dosyaları kaydediliyor...');
            const savedCount = await saveMediaFiles(mediaFiles);
            console.log(`${savedCount} medya dosyası kaydedildi`);

            // Medya dosyalarının varlığını belirtmek için bir işaret koy
            localStorage.setItem('whatsapp_has_media', 'true');
          } else {
            localStorage.removeItem('whatsapp_has_media');
          }

          setProcessingMessage('Yönlendiriliyor...');

          // Kısa bir gecikme ile işleme süreci simülasyonu
          setTimeout(() => {
            setLoading(false);
            setIsProcessing(false);
            router.push('/chat');
          }, 800);
        } catch (err) {
          console.error('Sohbet verisi işlenirken hata oluştu:', err);
          setError('Sohbet verisi işlenirken bir hata oluştu. Lütfen tekrar deneyin.');
          setLoading(false);
          setIsProcessing(false);
        }
      }, 1000);

    } catch (err) {
      stopProgress();
      console.error('Dosya yüklenirken hata oluştu:', err);
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Dosya işlenirken bir hata oluştu. Lütfen tekrar deneyin.');
      }
      setLoading(false);
      setIsProcessing(false);
    }
  };

  const onButtonClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  return (
    <div className="w-full">
      <div
        className={`relative overflow-hidden border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-300 ${
          dragActive
            ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 scale-105 shadow-lg'
            : 'border-gray-300 dark:border-gray-700 hover:border-emerald-400 hover:bg-gray-50 dark:hover:bg-gray-800/50'
        }`}
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        onClick={onButtonClick}
      >
        <div className="flex flex-col items-center justify-center">
          {!loading ? (
            <>
              <div className="mb-4 p-4 rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                <svg
                  className="w-10 h-10 text-emerald-600 dark:text-emerald-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
              </div>
              <p className="mb-2 text-lg font-medium text-gray-700 dark:text-gray-300">
                <span className="font-bold text-emerald-600 dark:text-emerald-400">WhatsApp</span> sohbetinizi yükleyin
              </p>
              <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">
                <span className="font-semibold">Dosya yüklemek için tıklayın</span> veya dosyayı buraya sürükleyin
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                WhatsApp sohbet yedeği dosyası (.TXT veya .ZIP)
              </p>
              <div className="mt-4 text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800/50 px-3 py-2 rounded-lg">
                <p>🔒 Tüm veriler cihazınızda işlenir. Sunucuya hiçbir veri gönderilmez.</p>
              </div>
            </>
          ) : (
            <div className="w-full">
              <div className="flex flex-col items-center">
                {isProcessing ? (
                  <>
                    <div className="p-4 mb-4 rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                      <svg
                        className="w-10 h-10 text-emerald-600 dark:text-emerald-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                        />
                      </svg>
                    </div>
                    <p className="text-lg font-medium text-emerald-600 dark:text-emerald-400 mb-2">{processingMessage}</p>
                    <div className="w-full max-w-md bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 mb-3">
                      <div
                        className="bg-emerald-600 h-2.5 rounded-full transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      ></div>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{uploadProgress}%</p>
                  </>
                ) : (
                  <>
                    <div className="p-4 mb-4 rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                      <svg
                        className="w-10 h-10 text-emerald-600 dark:text-emerald-400 animate-pulse"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                        />
                      </svg>
                    </div>
                    <p className="text-lg font-medium text-emerald-600 dark:text-emerald-400 mb-2">Dosya yükleniyor</p>
                    <div className="w-full max-w-md bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 mb-3">
                      <div
                        className="bg-emerald-600 h-2.5 rounded-full transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      ></div>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{uploadProgress}%</p>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".txt,.zip"
          onChange={handleChange}
        />
      </div>

      {error && (
        <div className="mt-4 p-4 border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 rounded-lg">
          <div className="flex items-center">
            <svg className="w-5 h-5 text-red-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-red-600 dark:text-red-400 font-medium">{error}</p>
          </div>
        </div>
      )}
    </div>
  );
}