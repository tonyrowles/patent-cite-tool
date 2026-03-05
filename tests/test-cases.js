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
    selectedText: 'UniAbs lack the first domain of the constant region (CHI ) which is present in the genome, but is spliced out during',
    category: 'modern-short',
  },
  {
    id: 'US11427642-spec-long',
    patentFile: './tests/fixtures/US11427642.json',
    selectedText: 'receptor exclusively expressed on plasma cells and plasmablasts. BCMA is a receptor for two ligands in the tumor necrosis factor (TNF) superfamily: APRIL (a prolif eration -inducing ligand, also known as TNFSF13 ; TALL - 2 and TRDL - 1; the high affinity ligand for BCMA) and B cell',
    category: 'modern-long',
  },
  {
    id: 'US11427642-claims-1',
    patentFile: './tests/fixtures/US11427642.json',
    selectedText: 'The invention claimed is : 1. A heavy chain -only antibody binding to human B-Cell Maturation Antigen (BCMA) comprising a heavy chain variable region comprising a CDR1 sequence of SEQ ID',
    category: 'claims',
  },
  {
    id: 'US11427642-cross-col',
    patentFile: './tests/fixtures/US11427642.json',
    selectedText: 'the CH2 and CH3 domains of classical antibodies. These UniAbs lack the first domain of the constant region (CHI ) which is present in the genome, but is spliced out during',
    category: 'cross-column',
  },
  {
    id: 'US11427642-repetitive',
    patentFile: './tests/fixtures/US11427642.json',
    selectedText: 'Maturation Antigen (BCMA) comprising a heavy chain variable region comprising a CDR1 sequence of SEQ ID',
    category: 'repetitive',
  },

  // =========================================================================
  // Modern granted patents — US11086978 (smart card / authentication)
  // =========================================================================
  {
    id: 'US11086978-spec-short',
    patentFile: './tests/fixtures/US11086978.json',
    selectedText: 'billions of dollars of yearly damages from fraudulent trans- actions, borne by consumers, merchants and financial insti- tutions.',
    category: 'modern-short',
  },
  {
    id: 'US11086978-spec-long',
    patentFile: './tests/fixtures/US11086978.json',
    selectedText: 'To provide more secure identification, specialized elec- tronic hardware, in the form of a " token " or " smart card',
    category: 'modern-long',
  },
  {
    id: 'US11086978-claims',
    patentFile: './tests/fixtures/US11086978.json',
    selectedText: 'What is claimed is: 1. A method of confirming by a peripheral device,',
    category: 'claims',
  },

  // =========================================================================
  // Modern granted patents — US10592688 (computing system / medical forms)
  // =========================================================================
  {
    id: 'US10592688-spec-short',
    patentFile: './tests/fixtures/US10592688.json',
    selectedText: 'criteria . One or more of the medical examination forms are selected from the identified examinations forms, and an instance of the selected form is generated for display to the user.',
    category: 'modern-short',
  },
  {
    id: 'US10592688-spec-long',
    patentFile: './tests/fixtures/US10592688.json',
    selectedText: 'criteria . One or more of the medical examination forms are selected from the identified examinations forms, and an instance of the selected form is generated for display to the user. The method further includes receiving a plurality of',
    category: 'modern-long',
  },
  {
    id: 'US10592688-claims',
    patentFile: './tests/fixtures/US10592688.json',
    selectedText: '1. A computing system comprising: a computer readable storage medium having program instructions embodied therewith ; and',
    category: 'claims',
  },
  {
    id: 'US10592688-cross-col',
    patentFile: './tests/fixtures/US10592688.json',
    selectedText: 'criteria . One or more of the medical examination forms are selected from the identified examinations forms, and an instance of the selected form is generated for display to the user. The method further includes receiving a plurality of',
    category: 'cross-column',
  },
  {
    id: 'US10592688-repetitive',
    patentFile: './tests/fixtures/US10592688.json',
    selectedText: '1. A computing system comprising: a computer readable storage medium having program instructions embodied therewith ; and',
    category: 'repetitive',
  },

  // =========================================================================
  // Modern granted patents — US6738932 (software identification / dump analysis)
  // =========================================================================
  {
    id: 'US6738932-spec-short',
    patentFile: './tests/fixtures/US6738932.json',
    selectedText: 'of information contained in the dumped memory image.',
    category: 'modern-short',
  },
  {
    id: 'US6738932-spec-long',
    patentFile: './tests/fixtures/US6738932.json',
    selectedText: 'and System calls. Often, dump analysis begins with analysis of these executables. Dump analysis, which includes inspec tion of the memory image for the cause of the crash, is a difficult and time-consuming task due to the large quantity of information contained in the dumped memory image.',
    category: 'modern-long',
  },
  {
    id: 'US6738932-claims',
    patentFile: './tests/fixtures/US6738932.json',
    selectedText: 'I claim: 1. A method for identifying Software executing on a computer System from a memory image from the computer System defining at a particular time a State of the executing Software, the method comprising:',
    category: 'claims',
  },
  {
    id: 'US6738932-cross-col',
    patentFile: './tests/fixtures/US6738932.json',
    selectedText: 'ing techniques of identifying the version ofSoftware running on a computer System do not effectively meet the need of',
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
    selectedText: 'ation error or a circuit breakdown may be caused. In a conventional computer system, a connecting state of an external I/O (input/output) device is checked by an initial diagnosis test (IRT test). For ex ample, a register capable of read/write operations is arranged at an I/O port of each I/O interface, and data representing a connecting state of an I/O device is stored in the register in advance. In this case, when a connecting state of an I/O device is to be checked, the data in this register is read out. The I/O device, e.g., a',
    category: 'pre2000-long',
  },
  {
    id: 'US5440748-claims',
    patentFile: './tests/fixtures/US5440748.json',
    selectedText: 'What is claimed is: 1. Computer system comprising: a computer main body which has a plurality of main components and main power supply means for supplying a plurality of first operating voltages to the main components;',
    category: 'claims',
  },
  {
    id: 'US5440748-cross-col',
    patentFile: './tests/fixtures/US5440748.json',
    selectedText: 'interface means for connecting the expansion unit to the computer main body; voltages to the main elements when the main power supply means is turned on and when a first power sup',
    category: 'cross-column',
  },
  {
    id: 'US5440748-repetitive',
    patentFile: './tests/fixtures/US5440748.json',
    selectedText: 'What is claimed is: 1. Computer system comprising: a computer main body which has a plurality of main components and main power supply means for',
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
    selectedText: 'mined frequency is applied to said piezo vibrating ele ment to cause mechanical vibration thereof, thereby by the above-mentioned charging electrode, each drop let is provided with a charge corresponding to the re',
    category: 'pre2000-long',
  },
  {
    id: 'US4723129-claims',
    patentFile: './tests/fixtures/US4723129.json',
    selectedText: 'We claim: 1. A bubble jet recording process for projecting drop lets of liquid, the process comprising the steps of:',
    category: 'claims',
  },
  {
    id: 'US4723129-cross-col',
    patentFile: './tests/fixtures/US4723129.json',
    selectedText: 'mined frequency is applied to said piezo vibrating ele ment to cause mechanical vibration thereof, thereby by the above-mentioned charging electrode, each drop let is provided with a charge corresponding to the re',
    category: 'cross-column',
  },

  // =========================================================================
  // Pre-2000 patents — US5959167 (lignin to gasoline, 1999)
  // =========================================================================
  {
    id: 'US5959167-spec-short',
    patentFile: './tests/fixtures/US5959167.json',
    selectedText: 'PROCESS FOR CONVERSION OF LIGNIN TO REFORMULATED HYDROCARBON GASOLINE',
    category: 'pre2000-short',
  },
  {
    id: 'US5959167-spec-long',
    patentFile: './tests/fixtures/US5959167.json',
    selectedText: 'This application claims the benefit of priority to U.S. Provisional Application No. 60/056,785, filed on Aug. 25, 1997, the disclosure of which is herein incorporated by reference.',
    category: 'pre2000-long',
  },

  // =========================================================================
  // Chemical patents — US9688736 (glucagon analog, peptide sequences)
  // =========================================================================
  {
    id: 'US9688736-chemical-short',
    patentFile: './tests/fixtures/US9688736.json',
    selectedText: 'sequence: His-Ser-Gln-Gly-Thr-Phe-Thr-Ser-Asp-Tyr-Ser Lys-Tyr-Leu-Asp-Ser-Arg-Arg-Ala-Gln-Asp-Phe-Val-Gln',
    category: 'chemical',
  },
  {
    id: 'US9688736-chemical-long',
    patentFile: './tests/fixtures/US9688736.json',
    selectedText: 'improve solubility and stability in acidic and physiological pH buffers are disclosed in WO2008086086. There is still a need for a compound that maintains the biological perfor mance of human glucagon under physiological conditions while also exhibiting sufficient solubility and chemical and physical stabilities under non-physiological conditions.',
    category: 'chemical',
  },
  {
    id: 'US9688736-chemical-seq',
    patentFile: './tests/fixtures/US9688736.json',
    selectedText: 'Tyr-Ser-His-Gly-Thr-Phe-Thr-Ser-Asp-Val-Ser-Lys-Tyr Leu-Asp-(Aib)-Lys-Lys-Ala-Ala-Glu-Phe-Val-Ala-Trp Leu-Leu-Glu-Glu (SEQ ID NO: 2). The present invention',
    category: 'chemical',
  },

  // =========================================================================
  // Chemical patents — US10472384 (steroid chemistry process)
  // =========================================================================
  {
    id: 'US10472384-chemical-claims',
    patentFile: './tests/fixtures/US10472384.json',
    selectedText: 'What is claimed is: 1. A process for preparing a compound of formula 1:',
    category: 'chemical',
  },

  // =========================================================================
  // Additional cross-column selections
  // =========================================================================
  {
    id: 'US7346586-cross-col',
    patentFile: './tests/fixtures/US7346586.json',
    selectedText: 'be implemented in software or hardware, with the proviso that the seed for the random number generator is different for each chip or system. The protocol therefore can be imple mented as a Single Chip Protocol or as a Double Chip',
    category: 'cross-column',
  },
  {
    id: 'US9876543-cross-col',
    patentFile: './tests/fixtures/US9876543.json',
    selectedText: 'Thepower-save clientmay briefly awaken to receive the AP beacons, and return immediately to power -save (sleep) mode if no pending downstream frames are available to be transferred . This may simplify the power-save protocol and',
    category: 'cross-column',
  },

  // =========================================================================
  // Additional claims selections — repetitive terms
  // =========================================================================
  {
    id: 'US7346586-claims-repetitive',
    patentFile: './tests/fixtures/US7346586.json',
    selectedText: '1. A validation protocol for a printer consumable com prising the steps of providing a printer containing a trusted authentication chip and a printer consumable containing an untrusted authentication chip;',
    category: 'repetitive',
  },
  {
    id: 'US4723129-claims-repetitive',
    patentFile: './tests/fixtures/US4723129.json',
    selectedText: '1. A bubble jet recording process for projecting drop lets of liquid, the process comprising the steps of: providing a bubble jet recording head having an ori fice from which droplets ofliquid are projected, an inlet to which liquid is supplied for delivery to the',
    category: 'repetitive',
  },
  {
    id: 'US8024718-claims-repetitive',
    patentFile: './tests/fixtures/US8024718.json',
    selectedText: '1. A method of optimizing address expressions within source-level code, wherein the source-level code describes the functionality ofan application to be executed on a digital device, the method comprising:',
    category: 'repetitive',
  },

  // =========================================================================
  // Additional modern-long and modern-short entries
  // =========================================================================
  {
    id: 'US8024718-spec-short',
    patentFile: './tests/fixtures/US8024718.json',
    selectedText: 'optimization can be applied in a context wherein resources are fixed or are predetermined.',
    category: 'modern-short',
  },
  {
    id: 'US8024718-spec-long',
    patentFile: './tests/fixtures/US8024718.json',
    selectedText: 'optimization can be applied in a context wherein resources are fixed or are predetermined. Furthermore, the article, Liem C., Paulin P. Jerraya A. "Address calculation of retargetable compilation and explo ration of instruction-set architectures". Proceedings 33" Design Automation Conference, describes an approach for rewriting code for instruction-set architectures which uses detailed knowledge ofa particular target architecture.',
    category: 'modern-long',
  },
  {
    id: 'US9876543-spec-short',
    patentFile: './tests/fixtures/US9876543.json',
    selectedText: 'from the AP to the client may trigger a series of measure ment reports (RRM frames ) in response.',
    category: 'modern-short',
  },
  {
    id: 'US9876543-spec-long',
    patentFile: './tests/fixtures/US9876543.json',
    selectedText: 'from the AP to the client may trigger a series of measure ment reports (RRM frames ) in response. Itmay therefore be possible to facilitate the periodic measurementand reporting ofCSIby the clientto the AP without incurring the overhead of periodic beamforming exchanges. Instead , the AP may issue a singlemeasurementrequest to the client, and receive not only periodic reports ofneighboring APs and clients but also of CSI.',
    category: 'modern-long',
  },
  {
    id: 'US9001285-spec-short',
    patentFile: './tests/fixtures/US9001285.json',
    selectedText: 'The scan lines and the data lines may be electrically con nected to the driver IC through peripheral wires in the non display area.',
    category: 'modern-short',
  },
  {
    id: 'US9001285-claims',
    patentFile: './tests/fixtures/US9001285.json',
    selectedText: 'What is claimed is: 1. An electronic device, comprising: a housing; and a display panel installed in the housing, comprising:',
    category: 'claims',
  },

  // =========================================================================
  // Pre-2000 patents — US4317036 (scanning X-ray microscope, 1982)
  // =========================================================================
  {
    id: 'US4317036-spec-short',
    patentFile: './tests/fixtures/US4317036.json',
    selectedText: 'Ever since the discovery ofX-ray radiation, attempts have been made to design X-ray microscopes (See',
    category: 'pre2000-short',
  },
  {
    id: 'US4317036-spec-long',
    patentFile: './tests/fixtures/US4317036.json',
    selectedText: 'Ever since the discovery ofX-ray radiation, attempts have been made to design X-ray microscopes (See "X-Ray Microscope" by Kirkpatrick and Pattee, pp 305-336, Handbuck der Physik, Volume 30, 1957) Ex cept for contact microradiography and the projection microscope where pencil beams of X-ray are used to project an image with little or no magnification, all X-ray microscopes with significant magnifications in clude systems of electron beam optics.',
    category: 'pre2000-long',
  },
  {
    id: 'US4317036-claims',
    patentFile: './tests/fixtures/US4317036.json',
    selectedText: 'I claim: 1. A scanning X-ray microscope including an X-ray source capable of emitting a beam of X-rays, a collima tor positioned to receive the beam of X-rays, to colli mate this beam, a focusing cone means to focus the beam ofX-rays, directed by the collimator, onto a focal plane,',
    category: 'claims',
  },

  // =========================================================================
  // Pre-2000 patents — US5371234 (ion-specific chelating agents, 1994)
  // =========================================================================
  {
    id: 'US5371234-spec-short',
    patentFile: './tests/fixtures/US5371234.json',
    selectedText: 'The present invention relates to the use of abidentate ligand as a chelating agent for, for example, iron. Spe cifically, the present invention relates to the use of 6 hydroxyhistidine, 4-(1-hydroxy-1-alkyl)imidazole or O derivatives thereofas a chelating agent.',
    category: 'pre2000-short',
  },
  {
    id: 'US5371234-spec-long',
    patentFile: './tests/fixtures/US5371234.json',
    selectedText: 'Diseases such as thalassemia which require repeated blood transfusions result in a build up of iron in the body which is deposited in the heart, liver, endocrine glands, as well as other organs. The iron overload, if not con trolled, is fatal. To reduce iron overload the patient is treated with selective iron chelators, the usual one being desferrioxamine B (Desfetal). Unfortunately, Desfetal is orally inactive and treatment is difficult.',
    category: 'pre2000-long',
  },
  {
    id: 'US5371234-claims',
    patentFile: './tests/fixtures/US5371234.json',
    selectedText: 'What is claimed: 1. A chelating agent comprising a chelatingly effec tive amount of a bidentate ligand selected from the group consisting ofa 9-hydroxyhistidine, 4-(1-hydroxy lalkyl)imidazole and derivatives thereof',
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
    selectedText: 'The present invention relates to a method for Securely executing registered Software applications in a computer System that is either being powered down or entering an energy Saving mode.',
    category: 'pre2000-short',
  },
  {
    id: 'US5850559-spec-long',
    patentFile: './tests/fixtures/US5850559.json',
    selectedText: 'Computers are becoming increasingly important in many aspects of modern life, both in homes and in businesses. Huge amounts of money are invested by companies and individuals to purchase executable Software. Even more money and time is spent developing the information con tained in data files Such as text documents and spreadsheets.',
    category: 'pre2000-long',
  },
  {
    id: 'US5850559-claims',
    patentFile: './tests/fixtures/US5850559.json',
    selectedText: 'What is claimed is: 1. A method for Secure execution of Software prior to a computer System entering a reduced energy consumption State, the computer System having a processor incorporating System management capabilities,',
    category: 'claims',
  },

  // =========================================================================
  // Modern patents — US7509250 (hardware key debug interface, 2009)
  // =========================================================================
  {
    id: 'US7509250-spec-short',
    patentFile: './tests/fixtures/US7509250.json',
    selectedText: 'This application claims the benefit of U.S. Provisional Application No. 60/673,291, filed on Apr. 20, 2005, (which is also referred to here as the \u201c291 Provisional Application\')',
    category: 'modern-short',
  },
  {
    id: 'US7509250-spec-long',
    patentFile: './tests/fixtures/US7509250.json',
    selectedText: 'ality, a debug interface communicatively coupled to the debug functionality, and a hardware key interface. Commu nication with the debug functionality over the debug interface is not permitted ifan authorized hardware key is not commu nicatively coupled to the hardware key interface.',
    category: 'modern-long',
  },
  {
    id: 'US7509250-claims',
    patentFile: './tests/fixtures/US7509250.json',
    selectedText: 'What is claimed is: 1. An apparatus having at least three modes comprising an enclosure that houses: debug functionality; a debug interface communicatively coupled to the debug functionality;',
    category: 'claims',
  },
  {
    id: 'US7509250-cross-col',
    patentFile: './tests/fixtures/US7509250.json',
    selectedText: 'ality, a debug interface communicatively coupled to the debug functionality, and a hardware key interface. Commu nication with the debug functionality over the debug interface is not permitted ifan authorized hardware key is not commu nicatively coupled to the hardware key interface. In another embodiment, a system comprises debug func tionality, a debug interface communicatively coupled to the',
    category: 'cross-column',
  },

  // =========================================================================
  // Modern patents — US8352400 (adaptive pattern recognition, 2013)
  // =========================================================================
  {
    id: 'US8352400-spec-short',
    patentFile: './tests/fixtures/US8352400.json',
    selectedText: 'Significant difficulties are experienced by users when pro grammable complex devices are infrequently used or pro grammed, or when a user attempts to use uncommon func tions of these devices, such as, for example video cassette recorders (hereinafter \\"VCRs).',
    category: 'modern-short',
  },
  {
    id: 'US8352400-spec-long',
    patentFile: './tests/fixtures/US8352400.json',
    selectedText: 'been due, in part, to the fact that manufacturers continue to add more features to existing devices, without simplifying those which already exist. People learn most efficiently through the interactive expe riences of doing, thinking, and knowing. For ease-of-use, efficiency, and lack of frustration of the user, utilizing the device should be intuitive.',
    category: 'modern-long',
  },
  {
    id: 'US8352400-claims',
    patentFile: './tests/fixtures/US8352400.json',
    selectedText: 'What is claimed is: 1. A distributed system for predicting items likely to appeal to a user, comprising: a plurality oflocal systems each havinga user interface, the user interface being configured to receive respective user input data;',
    category: 'claims',
  },
  {
    id: 'US8352400-cross-col',
    patentFile: './tests/fixtures/US8352400.json',
    selectedText: 'Significant difficulties are experienced by users when pro grammable complex devices are infrequently used or pro grammed, or when a user attempts to use uncommon func tions of these devices, such as, for example video cassette recorders (hereinafter \\"VCRs). Studies have concluded that 80% ofusers cannot correctly program their VCRs. This has been due, in part, to the fact that manufacturers continue to add more features to existing devices, without simplifying those which already exist.',
    category: 'cross-column',
  },

  // =========================================================================
  // Modern patents — US6324676 (FPGA customizable, 2001)
  // =========================================================================
  {
    id: 'US6324676-spec-short',
    patentFile: './tests/fixtures/US6324676.json',
    selectedText: 'Due to advancing Semiconductor processing technology, integrated circuits have greatly increased in functionality and complexity. For example, programmable devices Such as field programmable gate arrays (FPGAS) and program mable logic devices (PLDS), can incorporate ever increasing numbers of functional blockS and more flexible interconnect Structures to provide greater functionality and flexibility.',
    category: 'modern-short',
  },
  {
    id: 'US6324676-spec-long',
    patentFile: './tests/fixtures/US6324676.json',
    selectedText: 'FPGA 110 also includes dedicated internal logic. Dedi cated internal logic performs Specific functions and can only be minimally configured by a user. For example, configu ration port 120 is one example of dedicated internal logic. Other examples may include dedicated clock nets (not shown), power distribution grids (not shown), and boundary scan logic (i.e. IEEE Boundary Scan Standard 1149.1, not shown).',
    category: 'modern-long',
  },
  {
    id: 'US6324676-claims',
    patentFile: './tests/fixtures/US6324676.json',
    selectedText: 'What is claimed is: 1. A method for configuring a field programmable gate array (FPGA), the method comprising: pre-programming a first key into a key table of Said FPGA; processing configuration data in Said FPGA to detect a first locked macro; and unlocking Said first locked macro using Said first key pre-programmed into Said key table.',
    category: 'claims',
  },
  {
    id: 'US6324676-cross-col',
    patentFile: './tests/fixtures/US6324676.json',
    selectedText: 'FPGA 110 is illustrated with 16 CLBs, 16 IOBs, and 9 PSMs for clarity only. Actual FPGAs may contain thousands of CLBs, thousands of IOBS, and thousands of PSMs. The ratio of the number of CLBs, IOBS, and PSMs can also vary.',
    category: 'cross-column',
  },

  // =========================================================================
  // Modern patents — US10234567 (location awareness, 2019)
  // =========================================================================
  {
    id: 'US10234567-spec-short',
    patentFile: './tests/fixtures/US10234567.json',
    selectedText: 'vehicle 1 through its own antenna device. The antenna device of the second vehicle 2 demodulates the received electromagnetic waves and converts them into electric sig - nals , and sends the electric signals to its ECU .',
    category: 'modern-short',
  },
  {
    id: 'US10234567-claims',
    patentFile: './tests/fixtures/US10234567.json',
    selectedText: 'What is claimed is: 1. A location awareness apparatus equipped in a device, the location awareness apparatus comprising : a communication unit performing communications with a 60 plurality of satellites and with another device ; and',
    category: 'claims',
  },

  // =========================================================================
  // Modern patents — US10987654 (ceria-zirconia catalyst, 2021)
  // =========================================================================
  {
    id: 'US10987654-spec-short',
    patentFile: './tests/fixtures/US10987654.json',
    selectedText: 'The present invention relates to an oxygen storage mate- rial comprised of a ceria -zirconia-based composite oxide. In 10 Sm particular, it relates to an oxygen storage material with a fast oxygen storage rate and excellent purification performance',
    category: 'modern-short',
  },
  {
    id: 'US10987654-spec-long',
    patentFile: './tests/fixtures/US10987654.json',
    selectedText: 'In the past, as the method for removing harmful sub stances from the exhaust gas of automobiles such as carbon 20 exhaust gas even if the composition greatly deviates from monoxide (CO), hydrocarbons (HC), and nitrogen oxides (NOx), three -way catalysts having precious metals ( for example, Pt, Rh, Pd, Ir, Ru, etc.) as catalytic ingredients have been used.',
    category: 'modern-long',
  },
  {
    id: 'US10987654-claims',
    patentFile: './tests/fixtures/US10987654.json',
    selectedText: 'The invention claimed is : 1. A ceria -zirconia-based composite oxide oxygen storage material, which oxygen storage material has a molar ratio of 15 to claim 4 covering an inside wall of a metal or ceramic cerium and zirconium, by cerium /(cerium + zirconium ), of 0.33 to 0.90,',
    category: 'claims',
  },

  // =========================================================================
  // OCR divergence cases — US6324676 (FPGA customizable, 2001)
  // =========================================================================
  {
    id: 'US6324676-ocr-diverge-1',
    patentFile: './tests/fixtures/US6324676.json',
    selectedText: 'memories within an FPGA use Static random access memory',
    category: 'ocr',
  },
  {
    id: 'US6324676-ocr-diverge-2',
    patentFile: './tests/fixtures/US6324676.json',
    selectedText: 'macroS will function. Thus, macro Vendors can freely distribute locked macroS as long as the key to the macro is',
    category: 'ocr',
  },
  {
    id: 'US6324676-split-word',
    patentFile: './tests/fixtures/US6324676.json',
    selectedText: 'provide macros having high performance, flexibility, and low gate count.',
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
