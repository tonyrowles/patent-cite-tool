/**
 * Test case registry for the Patent Citation Tool accuracy harness.
 *
 * Each entry maps a test case ID to:
 *   - patentFile: path to the PositionMap JSON fixture
 *   - selectedText: text as the user would select it (concatenated from fixture PositionMap entries)
 *   - category: classification for accuracy reporting
 *
 * IMPORTANT: selectedText values are derived directly from the fixture PositionMap text
 * fields, ensuring matchAndCite can locate them in the fixture. Do not edit selectedText
 * values without also regenerating the fixture.
 *
 * Categories:
 *   modern-short   - Modern patent (2010+), 1-2 line selection
 *   modern-long    - Modern patent (2010+), multi-line/paragraph selection
 *   pre2000-short  - Pre-2000 patent, short selection (1-2 lines)
 *   pre2000-long   - Pre-2000 patent, longer selection
 *   chemical       - Chemical patent with formula/special characters/sequences
 *   cross-column   - Selection spanning a column boundary
 *   claims         - Selection from the claims section
 *   repetitive     - Selection with highly-repeated claim terms (comprising, wherein, said)
 */

export const CATEGORIES = {
  'modern-short': 'Modern patent (2010+), 1-2 line selection',
  'modern-long': 'Modern patent (2010+), multi-paragraph selection',
  'pre2000-short': 'Pre-2000 patent, short selection',
  'pre2000-long': 'Pre-2000 patent, long selection',
  'chemical': 'Chemical patent with formula/special characters',
  'cross-column': 'Selection spanning column boundary',
  'claims': 'Selection from claims section',
  'repetitive': 'Selection with highly-repeated phrases',
  'ocr': 'OCR divergence — HTML clean text vs PDF OCR artifact',
  'gutter': 'Synthetic gutter-number validation',
};

export const TEST_CASES = [
  // =========================================================================
  // Modern granted patents (2010-2020) — US11427642 (antibody patent)
  // =========================================================================
  {
    id: 'US11427642-spec-short-1',
    patentFile: './tests/fixtures/US11427642.json',
    selectedText: 'receptor exclusively expressed on plasma cells and plasmablasts. BCMA is a receptor for two ligands in the',
    category: 'modern-short',
  },
  {
    id: 'US11427642-spec-short-2',
    patentFile: './tests/fixtures/US11427642.json',
    selectedText: 'CH3 domains of classical antibodies. These UniAbs lack the first domain of the constant region (CH1) which is present in the genome, but is spliced out during mRNA processing. The absence of the',
    category: 'modern-short',
  },
  {
    id: 'US11427642-spec-long',
    patentFile: './tests/fixtures/US11427642.json',
    selectedText: 'receptor exclusively expressed on plasma cells and plasmablasts. BCMA is a receptor for two ligands in the tumor necrosis factor (TNF) superfamily: APRIL (a proliferation-inducing ligand, also known as TNFSF13; TALL-2 and TRDL-1; the high affinity ligand for BCMA) and B cell',
    category: 'modern-long',
  },
  {
    id: 'US11427642-claims-1',
    patentFile: './tests/fixtures/US11427642.json',
    selectedText: 'The invention claimed is: 1. A heavy chain-only antibody binding to human B-Cell Maturation Antigen (BCMA) comprising a heavy chain variable region comprising a CDR1 sequence of SEQ ID',
    category: 'claims',
  },
  {
    id: 'US11427642-cross-col',
    patentFile: './tests/fixtures/US11427642.json',
    selectedText: 'CH3), which are highly homologous to the CH2 and CH3 domains of classical antibodies. These UniAbs lack the first domain of the constant region (CH1) which is present in the genome, but is spliced out during mRNA processing. The absence of the',
    category: 'cross-column',
  },
  {
    id: 'US11427642-repetitive',
    patentFile: './tests/fixtures/US11427642.json',
    selectedText: 'Maturation Antigen (BCMA) comprising a heavy chain variable region comprising a CDR1 sequence of SEQ ID NO: 2, a CDR2 sequence of SEQ ID NO: 9, and a CDR3 sequence of SEQ ID NO: 13. 2',
    category: 'repetitive',
  },

  // =========================================================================
  // Modern granted patents — US11086978 (smart card / authentication)
  // =========================================================================
  {
    id: 'US11086978-spec-short',
    patentFile: './tests/fixtures/US11086978.json',
    selectedText: 'billions of dollars of yearly damages from fraudulent transactions, borne by consumers, merchants and financial institutions',
    category: 'modern-short',
  },
  {
    id: 'US11086978-spec-long',
    patentFile: './tests/fixtures/US11086978.json',
    selectedText: 'To provide more secure identification, specialized electronic hardware, in the form of a \u201ctoken\u201d or \u201csmart card',
    category: 'modern-long',
  },
  {
    id: 'US11086978-claims',
    patentFile: './tests/fixtures/US11086978.json',
    selectedText: 'What is claimed is: 1. A method of confirming by a peripheral device',
    category: 'claims',
  },

  // =========================================================================
  // Modern granted patents — US10592688 (computing system / medical forms)
  // =========================================================================
  {
    id: 'US10592688-spec-short',
    patentFile: './tests/fixtures/US10592688.json',
    selectedText: 'criteria. One or more of the medical examination forms are selected from the identified examinations forms, and an instance of the selected form is generated for display to the user',
    category: 'modern-short',
  },
  {
    id: 'US10592688-spec-long',
    patentFile: './tests/fixtures/US10592688.json',
    selectedText: 'criteria. One or more of the medical examination forms are selected from the identified examinations forms, and an instance of the selected form is generated for display to the user. The method further includes receiving a plurality of',
    category: 'modern-long',
  },
  {
    id: 'US10592688-claims',
    patentFile: './tests/fixtures/US10592688.json',
    selectedText: '1. A computing system comprising: a computer readable storage medium having program instructions embodied therewith; and',
    category: 'claims',
  },
  {
    id: 'US10592688-cross-col',
    patentFile: './tests/fixtures/US10592688.json',
    selectedText: 'criteria. One or more of the medical examination forms are selected from the identified examinations forms, and an instance of the selected form is generated for display to the user. The method further includes receiving a plurality of',
    category: 'cross-column',
  },
  {
    id: 'US10592688-repetitive',
    patentFile: './tests/fixtures/US10592688.json',
    selectedText: '1. A computing system comprising: a computer readable storage medium having program instructions embodied therewith; and',
    category: 'repetitive',
  },

  // =========================================================================
  // Modern granted patents — US6738932 (software identification / dump analysis)
  // =========================================================================
  {
    id: 'US6738932-spec-short',
    patentFile: './tests/fixtures/US6738932.json',
    selectedText: 'of information contained in the dumped memory image',
    category: 'modern-short',
  },
  {
    id: 'US6738932-spec-long',
    patentFile: './tests/fixtures/US6738932.json',
    selectedText: 'and system calls. Often, dump analysis begins with analysis of these executables. Dump analysis, which includes inspection of the memory image for the cause of the crash, is a difficult and time-consuming task due to the large quantity of information contained in the dumped memory image',
    category: 'modern-long',
  },
  {
    id: 'US6738932-claims',
    patentFile: './tests/fixtures/US6738932.json',
    selectedText: 'I claim: 1. A method for identifying software executing on a computer system from a memory image from the computer system defining at a particular time a state of the executing software, the method comprising',
    category: 'claims',
  },
  {
    id: 'US6738932-cross-col',
    patentFile: './tests/fixtures/US6738932.json',
    selectedText: 'ing techniques of identifying the version of software running on a computer system do not effectively meet the need of',
    category: 'cross-column',
  },

  // =========================================================================
  // Pre-2000 patents — US5440748 (computer I/O system, 1995)
  // =========================================================================
  {
    id: 'US5440748-spec-short',
    patentFile: './tests/fixtures/US5440748.json',
    selectedText: 'In a conventional computer system, a connecting state of an external I/O (input/output) device is',
    category: 'pre2000-short',
  },
  {
    id: 'US5440748-spec-long',
    patentFile: './tests/fixtures/US5440748.json',
    selectedText: 'ation error or a circuit breakdown may be caused. In a conventional computer system, a connecting state of an external I/O (input/output) device is checked by an initial diagnosis test (IRT test). For example, a register capable of read/write operations is arranged at an I/O port of each I/O interface, and data representing a connecting state of an I/O device is stored in the register in advance. In this case, when a connecting state of an I/O device is to be checked, the data in this register is read out. The I/O device, e.g., a',
    category: 'pre2000-long',
  },
  {
    id: 'US5440748-claims',
    patentFile: './tests/fixtures/US5440748.json',
    selectedText: 'What is claimed is: 1. Computer system comprising:a computer main body which has a plurality of main components and main power supply means for supplying a plurality of first operating voltages to the main components',
    category: 'claims',
  },
  {
    id: 'US5440748-cross-col',
    patentFile: './tests/fixtures/US5440748.json',
    selectedText: 'interface means for connecting the expansion unit to the computer main bo',
    category: 'cross-column',
  },
  {
    id: 'US5440748-repetitive',
    patentFile: './tests/fixtures/US5440748.json',
    selectedText: 'What is claimed is: 1. Computer system comprising:a computer main body which has a plurality of main components and main power supply means for',
    category: 'repetitive',
  },

  // =========================================================================
  // Pre-2000 patents — US4723129 (thermal inkjet printer, HP, 1988)
  // =========================================================================
  {
    id: 'US4723129-spec-short',
    patentFile: './tests/fixtures/US4723129.json',
    selectedText: 'The present invention relates to a liquid jet recording process and apparatus therefor, and more particularly to such process and apparatus in which a liquid record',
    category: 'pre2000-short',
  },
  {
    id: 'US4723129-spec-long',
    patentFile: './tests/fixtures/US4723129.json',
    selectedText: 'mined frequency is applied to said piezo vibrating element to cause mechanical vibration thereof, there',
    category: 'pre2000-long',
  },
  {
    id: 'US4723129-claims',
    patentFile: './tests/fixtures/US4723129.json',
    selectedText: 'We claim: 1. A bubble jet recording process for projecting droplets of liquid, the process comprising the steps of',
    category: 'claims',
  },
  {
    id: 'US4723129-cross-col',
    patentFile: './tests/fixtures/US4723129.json',
    selectedText: 'mined frequency is applied to said piezo vibrating element to cause mechanical vibration thereof, there',
    category: 'cross-column',
  },

  // =========================================================================
  // Pre-2000 patents — US5959167 (lignin to gasoline, 1999)
  // =========================================================================
  {
    id: 'US5959167-spec-short',
    patentFile: './tests/fixtures/US5959167.json',
    selectedText: 'of the invention for conversion of lignin into reformulated hydrocarbon gasoline are shown in the schematic process flow diagram',
    category: 'pre2000-short',
  },
  {
    id: 'US5959167-spec-long',
    patentFile: './tests/fixtures/US5959167.json',
    selectedText: 'This application claims the benefit of priority to U.S. Provisional Application No. 60/056,785, filed on Aug. 25, 1997, the disclosure of which is herein incorporated by reference',
    category: 'pre2000-long',
  },

  // =========================================================================
  // Chemical patents — US9688736 (glucagon analog, peptide sequences)
  // =========================================================================
  {
    id: 'US9688736-chemical-short',
    patentFile: './tests/fixtures/US9688736.json',
    selectedText: 'sequence: His-Ser-Gln-Gly-Thr-Phe-Thr-Ser-Asp-Tyr-Ser-Lys-Tyr-Leu-Asp-Ser-Arg-Arg-Ala-Gln-Asp-Phe-Val-Gln',
    category: 'chemical',
  },
  {
    id: 'US9688736-chemical-long',
    patentFile: './tests/fixtures/US9688736.json',
    selectedText: 'improve solubility and stability in acidic and physiological pH buffers are disclosed in WO2008086086. There is still a need for a compound that maintains the biological performance of human glucagon under physiological conditions while also exhibiting sufficient solubility and chemical and physical stabilities under non-physiological conditions',
    category: 'chemical',
  },
  {
    id: 'US9688736-chemical-seq',
    patentFile: './tests/fixtures/US9688736.json',
    selectedText: 'Tyr-Ser-His-Gly-Thr-Phe-Thr-Ser-Asp-Val-Ser-Lys-Tyr-Leu-Asp-(Aib)-Lys-Lys-Ala-Ala-Glu-Phe-Val-Ala-Trp-Leu-Leu-Glu-Glu (SEQ ID NO: 2). The present invention',
    category: 'chemical',
  },

  // =========================================================================
  // Chemical patents — US10472384 (steroid chemistry process)
  // =========================================================================
  {
    id: 'US10472384-chemical-claims',
    patentFile: './tests/fixtures/US10472384.json',
    selectedText: 'What is claimed is: 1. A process for preparing a compound of formula 1',
    category: 'chemical',
  },

  // =========================================================================
  // Additional cross-column selections
  // =========================================================================
  {
    id: 'US7346586-cross-col',
    patentFile: './tests/fixtures/US7346586.json',
    selectedText: 'be implemented in software or hardware, with the proviso that the seed for the random number generator is different for each chip or system. The protocol therefore can be implemented as a Single Chip Protocol or as a Double Chip',
    category: 'cross-column',
  },
  {
    id: 'US9876543-cross-col',
    patentFile: './tests/fixtures/US9876543.json',
    selectedText: 'The power-save client may briefly awaken to receive the AP beacons, and return immediately to power-save (sleep) mode if no pending downstream frames are available to be transferred. This may simplify the power-save protocol and',
    category: 'cross-column',
  },

  // =========================================================================
  // Additional claims selections — repetitive terms
  // =========================================================================
  {
    id: 'US7346586-claims-repetitive',
    patentFile: './tests/fixtures/US7346586.json',
    selectedText: '1. A validation protocol for a printer consumable comprising the steps of: providing a printer containing a trusted authentication chip and a printer consumable containing an untrusted authentication chip',
    category: 'repetitive',
  },
  {
    id: 'US4723129-claims-repetitive',
    patentFile: './tests/fixtures/US4723129.json',
    selectedText: '1. A bubble jet recording process for projecting droplets of liquid, the process comprising the steps of: providing a bubble jet recording head having an orifice from which droplets of liquid are projected, an inlet to which liquid is supplied for delivery to the',
    category: 'repetitive',
  },
  {
    id: 'US8024718-claims-repetitive',
    patentFile: './tests/fixtures/US8024718.json',
    selectedText: '1. A method of optimizing address expressions within source-level code, wherein the source-level code describes the functionality of an application to be executed on a digital device, the method comprising',
    category: 'repetitive',
  },

  // =========================================================================
  // Additional modern-long and modern-short entries
  // =========================================================================
  {
    id: 'US8024718-spec-short',
    patentFile: './tests/fixtures/US8024718.json',
    selectedText: 'optimization can be applied in a context wherein resources are fixed or are predetermined',
    category: 'modern-short',
  },
  {
    id: 'US8024718-spec-long',
    patentFile: './tests/fixtures/US8024718.json',
    selectedText: 'optimization can be applied in a context wherein resources are fixed or are predetermined. Furthermore, the article, Liem C., Paulin P., Jerraya A., \u201cAddress calculation of retargetable compilation and exploration of instruction-set architectures\u201d, Proceedings',
    category: 'modern-long',
  },
  {
    id: 'US9876543-spec-short',
    patentFile: './tests/fixtures/US9876543.json',
    selectedText: 'from the AP to the client may trigger a series of measurement reports (RRM frames) in response',
    category: 'modern-short',
  },
  {
    id: 'US9876543-spec-long',
    patentFile: './tests/fixtures/US9876543.json',
    selectedText: 'from the AP to the client may trigger a series of measurement reports (RRM frames) in response. It may therefore be possible to facilitate the periodic measurement and reporting of CSI by the client to the AP without incurring the overhead of periodic beamforming exchanges. Instead, the AP may issue a single measurement request to the client, and receive not only periodic reports of neighboring APs and clients but also of CSI',
    category: 'modern-long',
  },
  {
    id: 'US9001285-spec-short',
    patentFile: './tests/fixtures/US9001285.json',
    selectedText: 'The scan lines and the data lines may be electrically connected to the driver IC through peripheral wires in the non-display area',
    category: 'modern-short',
  },
  {
    id: 'US9001285-claims',
    patentFile: './tests/fixtures/US9001285.json',
    selectedText: 'What is claimed is: 1. An electronic device, comprising: a housing; and a display panel installed in the housing, comprising',
    category: 'claims',
  },

  // =========================================================================
  // Pre-2000 patents — US4317036 (scanning X-ray microscope, 1982)
  // =========================================================================
  {
    id: 'US4317036-spec-short',
    patentFile: './tests/fixtures/US4317036.json',
    selectedText: 'Ever since the discovery of X-ray radiation, attempts have been made to design X-ray microscopes (See',
    category: 'pre2000-short',
  },
  {
    id: 'US4317036-spec-long',
    patentFile: './tests/fixtures/US4317036.json',
    selectedText: 'Ever since the discovery of X-ray radiation, attempts have been made to design X-ray microscopes (See "X-Ray Microscope" by Kirkpatrick and Pattee, pp 305-336, Handbuck der Physik, Volume 30, 1957.) Except for contact microradiography and the projection microscope where pencil beams of X-ray are used to project an image with little or no magnification, all X-ray microscopes with significant magnifications include systems of electron beam optics',
    category: 'pre2000-long',
  },
  {
    id: 'US4317036-claims',
    patentFile: './tests/fixtures/US4317036.json',
    selectedText: 'I claim: 1. A scanning X-ray microscope including an X-ray source capable of emitting a beam of X-rays, a collimator positioned to receive the beam of X-rays, to collimate this beam, a focusing cone means to focus the beam of X-rays, directed by the collimator, onto a focal plane',
    category: 'claims',
  },

  // =========================================================================
  // Pre-2000 patents — US5371234 (ion-specific chelating agents, 1994)
  // =========================================================================
  {
    id: 'US5371234-spec-short',
    patentFile: './tests/fixtures/US5371234.json',
    selectedText: 'The present invention relates to the use of a bidentate ligand as a chelating agent for, for example, iron. Specifically, the present invention relates to the use o',
    category: 'pre2000-short',
  },
  {
    id: 'US5371234-spec-long',
    patentFile: './tests/fixtures/US5371234.json',
    selectedText: 'Diseases such as thalassemia which require repeated blood transfusions result in a build up of iron in the body which is deposited in the heart, liver, endocrine glands, as well as other organs. The iron overload, if not controlled, is fatal. To reduce iron overload the patient is treated with selective iron chelators, the usual one being desferrioxamine B (Desfetal). Unfortunately, Desfetal is orally inactive and treatment is difficult',
    category: 'pre2000-long',
  },
  {
    id: 'US5371234-claims',
    patentFile: './tests/fixtures/US5371234.json',
    selectedText: 'What is claimed: 1. A chelating agent comprising a chelatingly effective amount of a bidentate ligand selected from the group consisting',
    category: 'claims',
  },
  {
    id: 'US5371234-chemical-cross-col',
    patentFile: './tests/fixtures/US5371234.json',
    selectedText: 'Although the foregoing invention has been described in some detail by way of illustration, such detail is not intended to exclude the possibility that certain changes and modifications may be made within the scope of the claimed invention.',
    category: 'chemical',
  },

  // =========================================================================
  // Pre-2000 patents — US5850559 (secure software execution, 1998)
  // =========================================================================
  {
    id: 'US5850559-spec-short',
    patentFile: './tests/fixtures/US5850559.json',
    selectedText: 'The present invention relates to a method for securely executing registered software applications in a computer system that is either being powered down or entering an energy saving mode',
    category: 'pre2000-short',
  },
  {
    id: 'US5850559-spec-long',
    patentFile: './tests/fixtures/US5850559.json',
    selectedText: 'Computers are becoming increasingly important in many aspects of modern life, both in homes and in businesses. Huge amounts of money are invested by companies and individuals to purchase executable software. Even more money and time is spent developing the information contained in data files such as text documents and spreadsheets',
    category: 'pre2000-long',
  },
  {
    id: 'US5850559-claims',
    patentFile: './tests/fixtures/US5850559.json',
    selectedText: 'What is claimed is: 1. A method for secure execution of software prior to a computer system entering a reduced energy consumption state, the computer system having a processor incorporating system management capabilities',
    category: 'claims',
  },

  // =========================================================================
  // Modern patents — US7509250 (hardware key debug interface, 2009)
  // =========================================================================
  {
    id: 'US7509250-spec-short',
    patentFile: './tests/fixtures/US7509250.json',
    selectedText: 'This application claims the benefit of U.S. Provisional Application No. 60/673,291, filed on Apr. 20, 2005, (which is also referred to here as the \u201c\'291 Provisional Application',
    category: 'modern-short',
  },
  {
    id: 'US7509250-spec-long',
    patentFile: './tests/fixtures/US7509250.json',
    selectedText: 'ality, a debug interface communicatively coupled to the debug functionality, and a hardware key interface. Communication with the debug functionality over the debug interface is not permitted if an authorized hardware key is not communicatively coupled to the hardware key interface',
    category: 'modern-long',
  },
  {
    id: 'US7509250-claims',
    patentFile: './tests/fixtures/US7509250.json',
    selectedText: '1. An apparatus having at least three modes comprising an enclosure that houses: debug functionality; a debug interface communicatively coupled to the debug functionality',
    category: 'claims',
  },
  {
    id: 'US7509250-cross-col',
    patentFile: './tests/fixtures/US7509250.json',
    selectedText: 'ality, a debug interface communicatively coupled to the debug functionality, and a hardware key interface. Communication with the debug functionality over the debug interface is not permitted if an authorized hardware key is not communicatively coupled to the hardware key interface. In another embodiment, a system comprises debug functionality, a debug interface communicatively coupled to the',
    category: 'cross-column',
  },

  // =========================================================================
  // Modern patents — US8352400 (adaptive pattern recognition, 2013)
  // =========================================================================
  {
    id: 'US8352400-spec-short',
    patentFile: './tests/fixtures/US8352400.json',
    selectedText: 'Significant difficulties are experienced by users when programmable complex devices are infrequently used or programmed, or when a user attempts to use uncommon functions of these devices, such as, for example video cassette recorders (hereinafter \u201cVCRs',
    category: 'modern-short',
  },
  {
    id: 'US8352400-spec-long',
    patentFile: './tests/fixtures/US8352400.json',
    selectedText: 'been due, in part, to the fact that manufacturers continue to add more features to existing devices, without simplifying those which already exist. People learn most efficiently through the interactive experiences of doing, thinking, and knowing. For ease-of-use, efficiency, and lack of frustration of the user, utilizing the device should be intuitive',
    category: 'modern-long',
  },
  {
    id: 'US8352400-claims',
    patentFile: './tests/fixtures/US8352400.json',
    selectedText: '1. A distributed system for predicting items likely to appeal to a user, comprising: a plurality of local systems each having a user interface, the user interface being configured to receive respective user input data',
    category: 'claims',
  },
  {
    id: 'US8352400-cross-col',
    patentFile: './tests/fixtures/US8352400.json',
    selectedText: 'Significant difficulties are experienced by users when programmable complex devices are infrequently used or programmed, or when a user attempts to use uncommon functions of these devices, such as, for example video cassette recorders (hereinafter \u201cVCRs\u201d). Studies have concluded that 80% of users cannot correctly program their VCRs. This has been due, in part, to the fact that manufacturers continue to add more features to existing devices, without simplifying those which already exist',
    category: 'cross-column',
  },

  // =========================================================================
  // Modern patents — US6324676 (FPGA customizable, 2001)
  // =========================================================================
  {
    id: 'US6324676-spec-short',
    patentFile: './tests/fixtures/US6324676.json',
    selectedText: 'Due to advancing semiconductor processing technology, integrated circuits have greatly increased in functionality and complexity. For example, programmable devices such as field programmable gate arrays (FPGAs) and programmable logic devices (PLDS), can incorporate ever-increasing numbers of functional blocks and more flexible interconnect structures to provide greater functionality and flexibility',
    category: 'modern-short',
  },
  {
    id: 'US6324676-spec-long',
    patentFile: './tests/fixtures/US6324676.json',
    selectedText: 'FPGA 110 also includes dedicated internal logic. Dedicated internal logic performs specific functions and can only be minimally configured by a user. For example, configuration port 120 is one example of dedicated internal logic. Other examples may include dedicated clock nets (not shown), power distribution grids (not shown), and boundary scan logic (i.e. IEEE Boundary Scan Standard 1149.1, not shown).',
    category: 'modern-long',
  },
  {
    id: 'US6324676-claims',
    patentFile: './tests/fixtures/US6324676.json',
    selectedText: 'What is claimed is: 1. A method for configuring a field programmable gate array (FPGA), the method comprising: pre-programming a first key into a key table of said FPGA; processing configuration data in said FPGA to detect a first locked macro; and unlocking said first locked macro using said first key pre-programmed into said key table',
    category: 'claims',
  },
  {
    id: 'US6324676-cross-col',
    patentFile: './tests/fixtures/US6324676.json',
    selectedText: 'FPGA 110 is illustrated with 16 CLBs, 16 IOBs, and 9 PSMs for clarity only. Actual FPGAs may contain thousands of CLBs, thousands of IOBs, and thousands of PSMs. The ratio of the number of CLBs, IOBS, and PSMs can also vary.',
    category: 'cross-column',
  },

  // =========================================================================
  // Modern patents — US10234567 (location awareness, 2019)
  // =========================================================================
  {
    id: 'US10234567-spec-short',
    patentFile: './tests/fixtures/US10234567.json',
    selectedText: 'vehicle 1 through its own antenna device. The antenna device of the second vehicle 2 demodulates the received electromagnetic waves and converts them into electric signals, and sends the electric signals to its ECU.',
    category: 'modern-short',
  },
  {
    id: 'US10234567-claims',
    patentFile: './tests/fixtures/US10234567.json',
    selectedText: 'What is claimed is: 1. A location awareness apparatus equipped in a device, the location awareness apparatus comprising: a communication unit performing communications w',
    category: 'claims',
  },

  // =========================================================================
  // Modern patents — US10987654 (ceria-zirconia catalyst, 2021)
  // =========================================================================
  {
    id: 'US10987654-spec-short',
    patentFile: './tests/fixtures/US10987654.json',
    selectedText: 'The present invention relates to an oxygen storage material comprised of a ceria-zirconia-based composite oxide. I',
    category: 'modern-short',
  },
  {
    id: 'US10987654-spec-long',
    patentFile: './tests/fixtures/US10987654.json',
    selectedText: 'xide (CO), hydrocarbons (HC), and nitrogen oxides (NOX), three-way catalysts having precious metals (for example, Pt, Rh, Pd, Ir, Ru, etc.) as catalytic ingredients have been used',
    category: 'modern-long',
  },
  {
    id: 'US10987654-claims',
    patentFile: './tests/fixtures/US10987654.json',
    selectedText: 'The invention claimed is: 1. A ceria-zirconia-based composite oxide oxygen storage material, which oxygen storage material has a molar ratio',
    category: 'claims',
  },

  // =========================================================================
  // OCR divergence cases — US6324676 (FPGA customizable, 2001)
  // =========================================================================
  {
    id: 'US6324676-ocr-diverge-1',
    patentFile: './tests/fixtures/US6324676.json',
    selectedText: 'PCI bus interface. Typically the configuration memories within an FPGA use static random access memory (SRAM) cells. The configuration memories of',
    category: 'ocr',
  },
  {
    id: 'US6324676-ocr-diverge-2',
    patentFile: './tests/fixtures/US6324676.json',
    selectedText: 'macros will function. Thus, macro vendors can freely distribute locked macros as long as the key to the macro is',
    category: 'ocr',
  },
  {
    id: 'US6324676-split-word',
    patentFile: './tests/fixtures/US6324676.json',
    selectedText: 'provide macros having high performance, flexibility, and low gate count',
    category: 'ocr',
  },

  // =========================================================================
  // Synthetic gutter-number validation
  // =========================================================================
  {
    id: 'synthetic-gutter-1',
    patentFile: './tests/fixtures/synthetic-gutter.json',
    selectedText: 'receptor exclusively expressed on plasma cells and plasmablasts. BCMA is a receptor for two ligands in the',
    category: 'gutter',
  },

  // =========================================================================
  // Headerless PDF trigger case — US10203551 (Phase 23, ACCY-04)
  // The bug: PDF.js extracted "203" from patent number "10203551" as a
  // standalone header item, yielding impossible column 203. The fix
  // (structural validators + two-pass fallback inference) now produces
  // correct sequential columns. This entry is the integration-level proof.
  // =========================================================================
  {
    id: 'US10203551-spec-short',
    patentFile: './tests/fixtures/US10203551.json',
    selectedText: 'At present, backlight modules of liquid crystal display devices are mainly divided into a direct-down type and an edge-in type. An edge-in type of backlight module generally',
    category: 'modern-short',
  },
];

// =========================================================================
// KNOWN GAP (not a TEST_CASES entry): s->S case errors
// =========================================================================
// US6324676 has widespread s->S OCR artifacts (macroS, blockS, acceSS).
// When HTML selectedText uses correct lowercase ('macros') and PDF has 'macroS',
// normalizeOcr does NOT bridge the gap (s->S not in OCR_PAIRS by design).
// The algorithm still resolves at 0.96 via punctuation-agnostic alpha match,
// but this is NOT normalizeOcr working -- it's a different fallback path.
//
// Example:
//   selectedText: 'programming and enabling licensed macros in an FPGA.'
//   fixture: 'programming and enabling licensed macroS in an FPGA.' (col 1, line 33)
//   result: { citation: '1:33', confidence: 0.96 } -- via alpha-strip fallback
//
// s->S normalization is deferred to a future OCR phase per VALID-01 decision.
// OCR-03 requirement covers bounded substitution if US6324676 validation requires it.
