export default defineBackground(() => {
  let processingQueue = [];
  let currentTabId = null;
  let isProcessing = false;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "nextTab") {
      chrome.tabs.query({ currentWindow: true }, async (tabs) => {
        const activeTabs = await chrome.tabs.query({ 
          active: true, 
          currentWindow: true 
        });
        
        if (activeTabs.length > 0) {
          const currentIndex = activeTabs[0].index;
          const nextIndex = (currentIndex + 1) % tabs.length;
          await chrome.tabs.update(tabs[nextIndex].id, { active: true });
        }
      });
      
      return true;
    }

    if (message.action === "prevTab") {
      chrome.tabs.query({ currentWindow: true }, async (tabs) => {
        const activeTabs = await chrome.tabs.query({ 
          active: true, 
          currentWindow: true 
        });
        
        if (activeTabs.length > 0) {
          const currentIndex = activeTabs[0].index;
          const prevIndex = currentIndex === 0 ? tabs.length - 1 : currentIndex - 1;
          await chrome.tabs.update(tabs[prevIndex].id, { active: true });
        }
      });
      
      return true;
    }

    if (message.action === "processTabsSequentially") {
      processingQueue = message.data.map(item => ({
        ...item,
        filesData: item.files ? {
          desktop: item.files.desktop ? {
            name: item.files.desktop.name,
            type: item.files.desktop.type,
            size: item.files.desktop.size
          } : null,
          mobile: item.files.mobile ? {
            name: item.files.mobile.name,
            type: item.files.mobile.type,
            size: item.files.mobile.size
          } : null
        } : null
      }));
      
      isProcessing = true;
      processNextInQueue();
      sendResponse({ status: "started" });
      return true;
    }

    if (message.action === "clickAddBanner") {
      chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        if (tabs.length > 0) {
          try {
            await chrome.scripting.executeScript({
              target: { tabId: tabs[0].id },
              func: () => {
                const addBanner = document.querySelectorAll('table[id="banners-list"]')[0]?.nextElementSibling;
                if (addBanner) {
                  addBanner.click();
                  return { success: true };
                }
                return { success: false, error: "Button not found" };
              }
            });
            sendResponse({ success: true });
          } catch (error) {
            console.error('Error clicking addBanner:', error);
            sendResponse({ success: false, error: error.message });
          }
        }
      });
      return true;
    }
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (isProcessing && tabId === currentTabId && changeInfo.status === 'complete') {
      console.log('Tab fully loaded, waiting before clicking...');
      
      setTimeout(async () => {
        try {
          const currentItem = processingQueue[0]; 
          
          const clickResult = await chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: () => {
              const addBanner = document.querySelectorAll('table[id="banners-list"]')[0]?.nextElementSibling;
              if (addBanner) {
                addBanner.click();
                console.log('AddBanner clicked!');
                return { success: true };
              }
              return { success: false, error: "Button not found" };
            }
          });

          console.log('Click result:', clickResult);

          setTimeout(async () => {
            //updated
            await uploadBanners(tabId);
            // updated
            setTimeout(() => {
              processNextInQueue();
            }, 2000);
          }, 2000);

        } catch (error) {
          console.error('Error executing script:', error);
          setTimeout(() => {
            processNextInQueue();
          }, 2000);
        }
      }, 2000); 
    }
  });

  async function uploadBanners(tabId) {
    // try {
    //   await chrome.scripting.executeScript({
    //     target: { tabId: tabId },
    //     func: (filesData) => {
    //       const form = document.querySelector('form.banner-form');
    //       if (!form) {
    //         console.error('Form not found');
    //         return { success: false, error: 'Form not found' };
    //       }

    //       const desktopInputs = form.querySelectorAll('input[type="file"][name^=pic][size="30"]');
    //       const mobileInputs = form.querySelectorAll('input[type="file"][name^=mobile_pic][size="30"]');

    //       if (filesData.desktop && desktopInputs.length > 0) {
    //         const dataTransfer = new DataTransfer();
    //         const file = new File([filesData.desktop.data], filesData.desktop.name, { 
    //           type: filesData.desktop.type 
    //         });
    //         dataTransfer.items.add(file);
    //         desktopInputs[0].files = dataTransfer.files;
    //         console.log('Desktop banner uploaded');
    //       }

    //       if (filesData.mobile && mobileInputs.length > 0) {
    //         const dataTransfer = new DataTransfer();
    //         const file = new File([filesData.mobile.data], filesData.mobile.name, { 
    //           type: filesData.mobile.type 
    //         });
    //         dataTransfer.items.add(file);
    //         const modernMobileInputs = Array.from(mobileInputs).slice(17);
    //         if (modernMobileInputs.length > 0) {
    //           modernMobileInputs[0].files = dataTransfer.files;
    //           console.log('Mobile banner uploaded');
    //         }
    //       }

    //       return { success: true };
    //     },
    //     args: [files]
    //   });
      
    //   console.log('Banners uploaded successfully');
    // } catch (error) {
    //   console.error('Error uploading banners:', error);
    // }
   try {
    const { zipBanners } = await chrome.storage.local.get('zipBanners');

    if (!zipBanners || Object.keys(zipBanners).length === 0) {
      console.warn(`Brak bannerów w storage dla tab ${tabId}`);
      return;
    }

    // Rekonstrukcja plików
    const files = [];
    for (const entry of Object.values(zipBanners)) {
      try {
        const uint8 = new Uint8Array(entry.data);
        const blob = new Blob([uint8], { type: entry.type });
        const file = new File([blob], entry.name, { type: entry.type });
        files.push(file);
      } catch (err) {
        console.error(`Błąd rekonstrukcji pliku ${entry.name}:`, err);
      }
    }

    if (files.length === 0) {
      console.warn(`Żaden plik nie został zrekonstruowany dla tab ${tabId}`);
      return;
    }

    console.log(`Przygotowano ${files.length} plików do wstrzyknięcia → tab ${tabId}`);

    const injectionResult = await chrome.scripting.executeScript({
      target: { tabId },
      func: (filesArray) => {
        if (typeof window.checkedDeviceType !== 'function' ||
            typeof window.filledCashback !== 'function' ||
            typeof window.getCurrentShop !== 'function') {
          console.error('Brak funkcji wypełniania na stronie');
          return { success: false, error: 'Brak funkcji na window' };
        }

        let attempts = 0;
        const maxAttempts = 5;
        const delay = 800; // ms między próbami

        function tryFill() {
          const form = document.querySelector('form.banner-form');
          if (!form) {
            if (attempts < maxAttempts) {
              attempts++;
              console.log(`Formularz jeszcze nie znaleziony, próba ${attempts}/${maxAttempts}`);
              setTimeout(tryFill, delay);
              return { success: false, retrying: true };
            }
            console.error('Formularz nie znaleziony po wszystkich próbach');
            return { success: false, error: 'Form not found after retries' };
          }

          // Formularz znaleziony → wypełniamy
          const desktopInputs = Array.from(
            form.querySelectorAll('input[type="file"][name^=pic][size="30"]')
          );
          const mobileInputs = Array.from(
            form.querySelectorAll('input[type="file"][name^=mobile_pic][size="30"]')
          );

          const cashbackMobile = mobileInputs.slice(Math.floor(mobileInputs.length / 2));

          const currentShop = window.getCurrentShop();

          let filledCount = 0;

          filesArray.forEach(file => {
            const nameUpper = file.name
              .replace(/\.[^/.]+$/, '')
              .trim()
              .toUpperCase();

            const parts = nameUpper.split('_');
            const slugParts = parts.filter(p => isNaN(Number(p)) && p !== 'DESKTOP' && p !== 'MOBILE');
            const isCashback = slugParts.length > 1;

            if (isCashback) {
              window.filledCashback(file, desktopInputs, currentShop);
              window.filledCashback(file, cashbackMobile, currentShop);
              filledCount++;
            } else {
              window.checkedDeviceType(file, 'desktop', desktopInputs);
              window.checkedDeviceType(file, 'mobile', mobileInputs);
              filledCount++;
            }
          });

          if (filledCount > 0) {
            const firstInput = desktopInputs[0] || mobileInputs[0];
            if (firstInput) {
              firstInput.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }

          return { success: true, filled: filledCount };
        }

        // Startujemy pierwszą próbę
        return tryFill();
      },
      args: [files],
    });

    // Wynik wstrzyknięcia
    const result = injectionResult?.[0]?.result;

    if (result?.success) {
      console.log(`[tab ${tabId}] Wypełniono ${result.filled} bannerów`);
    } else if (result?.retrying) {
      console.log(`[tab ${tabId}] Retry w toku – wynik przyjdzie później`);
    } else {
      console.warn(`[tab ${tabId}] Wypełnianie nie powiodło się`, result);
    }

  } catch (err) {
    console.error(`uploadBanners błąd (tab ${tabId}):`, err);
  }
  }

  function processNextInQueue() {
    if (processingQueue.length === 0) {
      console.log('✅ All tabs processed!');
      isProcessing = false;
      currentTabId = null;
      return;
    }
    
    const item = processingQueue.shift();
    console.log(`🔄 Processing: ${item.name} (${processingQueue.length} remaining)`);
    
    chrome.tabs.create({ url: item.url, active: true }, (tab) => {
      currentTabId = tab.id;
      console.log(`📂 Opened tab ${tab.id} for ${item.name}`);
    });
  }
});