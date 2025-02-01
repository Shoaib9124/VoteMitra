App = {
  loading: false,
  contracts: {},

  load: async () => {
    await App.loadWeb3();
    await App.loadAccount();
    await App.loadContract();
    await App.render();
    App.bindEvents();
  },

  loadWeb3: async () => {
    if (typeof web3 !== 'undefined') {
      App.web3Provider = web3.currentProvider;
      web3 = new Web3(web3.currentProvider);
    } else {
      window.alert("Please connect to MetaMask.");
    }

    if (window.ethereum) {
      window.web3 = new Web3(ethereum);
      try {
        await ethereum.enable();
      } catch (error) {
        console.error("User denied account access");
      }
    } else if (window.web3) {
      App.web3Provider = web3.currentProvider;
      window.web3 = new Web3(web3.currentProvider);
    } else {
      console.log('Non-Ethereum browser detected. You should consider trying MetaMask!');
    }
  },

  loadAccount: async () => {
    const accounts = await web3.eth.getAccounts();
    App.account = accounts[0];
    console.log("Account loaded:", App.account);
  },

  loadContract: async () => {
    const votingSystem = await $.getJSON('/build/contracts/Voting.json');
    App.contracts.Voting = TruffleContract(votingSystem);
    App.contracts.Voting.setProvider(App.web3Provider);
    App.votingSystem = await App.contracts.Voting.deployed();
  },

  render: async () => {
    if (App.loading) return;
    App.setLoading(true);

    $('#account').html(App.account);

    await App.renderPolls();

    App.setLoading(false);
  },

  renderPolls: async () => {
    const pollCount = await App.votingSystem.pollsCount();
    const $pollTemplate = $('.pollTemplate');

    for (let i = 0; i < pollCount; i++) {
      const poll = await App.votingSystem.polls(i);
      const question = poll.question;
      const options = await App.votingSystem.getPollOptions(i);

      const $newPollTemplate = $pollTemplate.clone();
      $newPollTemplate.find('.question').html(question);

      options.forEach((option, index) => {
        // Inside the loop of render polls:(for dynamic)
        $newPollTemplate.find('.options').append(`
          <label>
            <input 
              type="radio" 
              name="poll_${i}" 
              value="${index}" 
              data-pollindex="${i}" 
            />
            ${option}
          </label><br>
        `);
      });

      $('#pollsList').append($newPollTemplate);
      $newPollTemplate.show();
    }
  },

  createPoll: async () => {
    const question = $('#question').val();
    const optionsInput = $('#options').val();
    const options = optionsInput.split(',').map(option => option.trim());

    if (!question || options.length === 0) {
      alert("Please enter a question and at least one option.");
      return;
    }

    await App.votingSystem.createPoll(question, options, { from: App.account });
    alert("Poll created successfully!");
    await App.renderPolls();
  },

  vote: async () => {
    // Get the selected radio button
    const selectedOption = $('input[name^="poll_"]:checked');

    // Check if any option is selected
    if (!selectedOption.length) {
        alert("Please select an option.");
        return;
    }

    // Extract poll index and option index
    const selectedPollIndex = selectedOption.data('pollindex'); 
    const selectedOptionIndex = selectedOption.val();

    console.log("Selected Poll Index:", selectedPollIndex);
    console.log("Selected Option Index:", selectedOptionIndex);

    // QR code validation
    const qrCode = $('#qrUpload')[0].files[0];
    if (!qrCode) {
        alert("Please upload a QR code.");
        return;
    }

    try {
        // Decode QR code
        const qrData = await App.decodeQRCodeFromFile(qrCode);
        console.log("Decoded QR Data:", qrData);

        // Check if the user has already voted using the contract's mapping
        const hasVoted = await App.votingSystem.hasVoted(App.account);
        if (hasVoted) {
            alert("You have already voted. Please switch accounts to vote again.");
            return;
        }

        // Validate voter and submit vote
        if (qrData && App.isValidVoter(qrData)) {
            await App.votingSystem.vote(selectedPollIndex, selectedOptionIndex, qrData, { 
                from: App.account,
                gas: 300000 // Explicit gas limit to prevent estimation issues
            });

            alert("Vote submitted successfully!");
            await App.showVotersList();
        } else {
            alert("Invalid voter ID or already voted.");
        }
    } catch (error) {
        console.error("Full error:", error);
        
        // Extract meaningful error messages(for error handling)
        const revertMsg = error.data?.message || 
                          error.message.match(/revert (.*)/)?.[1] || 
                          "Unknown error";

        if (revertMsg.includes("You have already voted")) {
            alert("You have already voted. Switch MetaMask accounts to vote again.");
        } else if (revertMsg.includes("QR code has already been used")) {
            alert("This QR code has already been used.");
        } else {
            alert(`Vote failed: ${revertMsg}`);
        }
    }
},

decodeQRCodeFromFile: async (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.width = img.width;
                canvas.height = img.height;
                context.drawImage(img, 0, 0);
                const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
                const qrCode = jsQR(imageData.data, canvas.width, canvas.height);
                qrCode ? resolve(qrCode.data) : reject("QR code not found in the image.");
            };
            img.src = e.target.result;
        };
        reader.onerror = () => reject("Error reading file.");
        reader.readAsDataURL(file);
    });
}
,

  handleQRUpload: (event) => {
    const qrFile = event.target.files[0];
    if (!qrFile) {
      alert("Please upload a file.");
      return;
    }

    App.decodeQRCodeFromFile(qrFile).then((qrData) => {
      console.log("QR Code Data:", qrData);
      // Add your additional logic here to handle QR data
    }).catch((error) => {
      console.error("Error decoding QR code:", error);
    });
  },

  isValidVoter: (voterID) => {
    // Implement voter validation logic here
    const allowedVoters = ["12345", "67890", "ABCDE","vote123","vote124","vote125"]; // Example valid voter IDs
    return allowedVoters.includes(voterID);
  },

  showVotersList: async () => {
    const votersList = await App.votingSystem.getVoters();
    const $votersList = $('#votersList');
    $votersList.empty();
    votersList.forEach(voter => {
      $votersList.append(`<li>${voter}</li>`);
    });
    $('#votersListSection').show();
  },

  bindEvents: () => {
    $('#showResultsBtn').click(App.displayResults);
  },

  // Display results
  displayResults: async () => {
    
    try {
      // Get the total number of polls
      const pollsCount = await App.votingSystem.pollsCount();
      
      let resultsHTML = '';

      // Loop through all polls
      for (let i = 0; i < pollsCount; i++) {
        // Get poll question
        const question=await App.votingSystem.getPollQuestion(i);
        
        // Get poll options and votes
        const options = await App.votingSystem.getPollOptions(i);
        const votes = await App.votingSystem.getPollVotes(i);
        
        // Create HTML for each poll
        resultsHTML += `
          <div class="poll-result">
            <h3>${question}</h3>
            <ul>
              ${options.map((option, index) => `<li>${option}: ${votes[index]} votes</li>`).join('')}
            </ul>
          </div>
        `;
      }


      // Inject the results into the HTML
      $('#resultsSection').html(resultsHTML);
    } catch (error) {
      console.error("Error loading results: ", error);
      $('#resultsSection').html('<p>Error loading results.</p>');
    }
  },

  setLoading: (boolean) => {
    App.loading = boolean;
    const loader = $('#loader');
    const content = $('#content');
    if (boolean) {
      loader.show();
      content.hide();
    } else {
      loader.hide();
      content.show();
    }
  }
};

$(async () => {
  await App.load();
  $('#qrUpload').change(App.handleQRUpload);  // Attach the handleQRUpload to file input change event
  $('#createPollBtn').click(async () => {
    await App.createPoll();
  });
  $('#showResultsBtn').click(async () => {
    await App.displayResults();  
  });
});
