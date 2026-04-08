Attribute VB_Name = "A_Declare_Load"
Public Const SHIFT_KEY = &H10    'Shift

#If VBA7 Then
    Declare PtrSafe Function GetKeyState Lib "USER32" (ByVal vKey As Long) As Integer
#Else
    Declare Function GetKeyState Lib "USER32" (ByVal vKey As Long) As Integer
#End If


' DECLARE DATA VARIABLES %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
    
    Public SheetName As String
     
    Public PercentageQuotes(300) As Double
    Public UnitNames(300) As String
    Public ElecThisReadings(300) As Double
    Public ElecPrevReadings(300) As Double
    Public ElecUnitCons(300) As Double
    
    Public ElecBulkDiff(300) As Double
    Public OptionCharge2(300) As Double
    Public OptionCharge3(300) As Double
    Public WaterBulkDiff(300) As Double
    Public OptionCharge5(300) As Double
    Public OptionCharge6(300) As Double
    Public OptionCharge7(300) As Double
    Public OptionCharge8(300) As Double
    
    Public UnitElecCost(300) As Double
    Public UnitWaterCost(300) As Double
     
    Public WaterThisReadings(300) As Double
    Public WaterPrevReadings(300) As Double
    Public WaterUnitCons(300) As Double
    
    Public PrepaidElecInstalled(300) As Double
    Public PrepaidElecTotal As Double
    Public PPElecConvMeterTotal As Double
    
    Public PPTotalElecCost As Double
    Public PPTotalElecCostInclVat As Double
    Public PPNoOfElecInstalled As Double
  
    Public PrepaidWaterInstalled(300) As Double
    Public PrepaidWaterTotal As Double
    Public PPWaterConvMeterTotal As Double
    
    Public PPTotalWaterCost As Double
    Public PPTotalWaterCostInclVat As Double
    Public PPNoOfWaterInstalled As Double
  
    
    Public IgnoreNegComP As Boolean
     
    
    
    Public PQ As Double
    Public NextLine As Double
     
    Public ElecTotalCon As Double
    Public ElecBulkTotCon As Double
    Public ElecUnitTotCon As Double
    Public UnitNo As Integer
    
    Public ElecActualTotCharge As Double
    Public ElecBulkTotCharge As Double
    Public ElecUnitTotCharge As Double
    
    Public WaterActualTotCharge As Double
    
    Public WaterBulkTotCharge As Double
    Public WaterUnitTotCharge As Double
    Public WaterDifference As Double
    Public ElecDifference As Double
    Public RemElecDiff As Double
    Public RemWaterDiff As Double

    Public WaterTotalCon As Double
    Public WaterBulkTotCon As Double
    Public WaterUnitTotCon As Double
    
    Public ElecUnitCount As Double
    Public ElecComCount As Double
    Public ElecBulkCount As Double
    
    Public WaterUnitCount As Double
    Public WaterComCount As Double
    Public WaterBulkCount As Double
    
    Public TotalUnitCount As Double
    Public ChargeableUnitCount As Double
     
    Public ElecActualTotCon As Double
    Public WaterActualTotCon As Double
    
    Public ElecSurcharge As Double
    Public WaterSurcharge As Double
    Public SanAmount As Double
    Public RefuseAmount As Double
    
    Public ElecActualPortion As Double
    Public WaterActualPortion As Double
    
    Public ThisReading As Double
    Public PrevReading As Double
    Public Consumption As Double
    
    Public ExCount As Integer
    
    Public BuildingName As String   ' Get Building Name
    Public SelectedUnitName As String   ' Get Building Name
    Public SelCol As Integer        ' Get Selected Column
    Public SelMonth  As String      ' Selected Month
    Public SelDate As String        ' Get Selected Date based on current column
    Public PrevDate As String       ' Get Previous Date based on current column
    
    Public ElecTariffUnits1 As Double
    Public ElecTariffCost1 As Double
    Public ElecTariffUnits2 As Double
    Public ElecTariffCost2 As Double
    Public ElecTariffUnits3 As Double
    Public ElecTariffCost3 As Double
    Public ElecTariffUnits4 As Double
    Public ElecTariffCost4 As Double
    Public ElecTariffUnits5 As Double
    Public ElecTariffCost5 As Double
    Public ElecTariffUnits6 As Double
    Public ElecTariffCost6 As Double
    Public ElecTariffUnits7 As Double
    Public ElecTariffCost7 As Double
    Public ElecTariffUnit8 As Double
    Public ElecTariffCost8 As Double
    
    Public WaterTariffUnits1 As Double
    Public WaterTariffCost1 As Double
    Public WaterTariffUnits2 As Double
    Public WaterTariffCost2 As Double
    Public WaterTariffUnits3 As Double
    Public WaterTariffCost3 As Double
    Public WaterTariffUnits4 As Double
    Public WaterTariffCost4 As Double
    Public WaterTariffUnits5 As Double
    Public WaterTariffCost5 As Double
    Public WaterTariffUnits6 As Double
    Public WaterTariffCost6 As Double
    Public WaterTariffUnits7 As Double
    Public WaterTariffCost7 As Double
    Public WaterTariffUnits8 As Double
    Public WaterTariffCost8 As Double
    
    Public VatPercent As Double
    Public LastBuilding As String
    Public FirstDataRow As Integer
    Public LastDataRow As Integer
    
    Public OutputPath As String
    
    Public OptionText1 As String
    Public OptionText2 As String
    Public OptionText3 As String
    Public OptionText4 As String
    Public OptionText5 As String
    Public OptionText6 As String
    Public OptionText7 As String
    Public OptionText8 As String
   
    Public OptionChoice1 As String
    Public OptionChoice2 As String
    Public OptionChoice3 As String
    Public OptionChoice4 As String
    Public OptionChoice5 As String
    Public OptionChoice6 As String
    Public OptionChoice7 As String
    Public OptionChoice8 As String
        
    Public OptionColor1 As Integer
    Public OptionColor2 As Integer
    Public OptionColor3 As Integer
    Public OptionColor4 As Integer
    Public OptionColor5 As Integer
    Public OptionColor6 As Integer
    Public OptionColor7 As Integer
    Public OptionColor8 As Integer
        
    Public OptionAmount1 As Double
    Public OptionAmount2 As Double
    Public OptionAmount3 As Double
    Public OptionAmount4 As Double
    Public OptionAmount5 As Double
    Public OptionAmount6 As Double
    Public OptionAmount7 As Double
    Public OptionAmount8 As Double
 
    
    Public ShowOptionStatus As Boolean

' -----------------------------------------------------

    ' ----------- Electricity
    Public ElecActualTariffU1  As Double
    Public ElecActualTariffC1  As Double
    Public ElecActualTariffU2  As Double
    Public ElecActualTariffC2  As Double
    Public ElecActualTariffU3  As Double
    Public ElecActualTariffC3  As Double
    Public ElecActualTariffU4  As Double
    Public ElecActualTariffC4  As Double
    Public ElecActualTariffU5  As Double
    Public ElecActualTariffC5  As Double
    Public ElecActualTariffU6  As Double
    Public ElecActualTariffC6  As Double
    Public ElecActualTariffU7  As Double
    Public ElecActualTariffC7  As Double
    Public ElecActualTariffU8  As Double
    Public ElecActualTariffC8  As Double
    
    Public ElecBulkTariffU1 As Double
    Public ElecBulkTariffC1 As Double
    Public ElecBulkTariffU2 As Double
    Public ElecBulkTariffC2 As Double
    Public ElecBulkTariffU3 As Double
    Public ElecBulkTariffC3 As Double
    Public ElecBulkTariffU4 As Double
    Public ElecBulkTariffC4 As Double
    Public ElecBulkTariffU5 As Double
    Public ElecBulkTariffC5 As Double
   Public ElecBulkTariffU6 As Double
    Public ElecBulkTariffC6 As Double
   Public ElecBulkTariffU7 As Double
    Public ElecBulkTariffC7 As Double
   Public ElecBulkTariffU8 As Double
    Public ElecBulkTariffC8 As Double
    
    Public ElecUnitTariffU1 As Double
    Public ElecUnitTariffC1 As Double
    Public ElecUnitTariffU2 As Double
    Public ElecUnitTariffC2 As Double
    Public ElecUnitTariffU3 As Double
    Public ElecUnitTariffC3 As Double
    Public ElecUnitTariffU4 As Double
    Public ElecUnitTariffC4 As Double
    Public ElecUnitTariffU5 As Double
    Public ElecUnitTariffC5 As Double
    Public ElecUnitTariffU6 As Double
    Public ElecUnitTariffC6 As Double
    Public ElecUnitTariffU7 As Double
    Public ElecUnitTariffC7 As Double
    Public ElecUnitTariffU8 As Double
    Public ElecUnitTariffC8 As Double
    
    ' ----------- Water
    Public WaterActualTariffU1  As Double
    Public WaterActualTariffC1  As Double
    Public WaterActualTariffU2  As Double
    Public WaterActualTariffC2  As Double
    Public WaterActualTariffU3  As Double
    Public WaterActualTariffC3  As Double
    Public WaterActualTariffU4  As Double
    Public WaterActualTariffC4  As Double
    Public WaterActualTariffU5  As Double
    Public WaterActualTariffC5  As Double
    Public WaterActualTariffU6  As Double
    Public WaterActualTariffC6  As Double
    Public WaterActualTariffU7  As Double
    Public WaterActualTariffC7  As Double
    Public WaterActualTariffU8  As Double
    Public WaterActualTariffC8  As Double
  
    Public WaterBulkTariffU1 As Double
    Public WaterBulkTariffC1 As Double
    Public WaterBulkTariffU2 As Double
    Public WaterBulkTariffC2 As Double
    Public WaterBulkTariffU3 As Double
    Public WaterBulkTariffC3 As Double
    Public WaterBulkTariffU4 As Double
    Public WaterBulkTariffC4 As Double
    Public WaterBulkTariffU5 As Double
    Public WaterBulkTariffC5 As Double
    Public WaterBulkTariffU6 As Double
    Public WaterBulkTariffC6 As Double
    Public WaterBulkTariffU7 As Double
    Public WaterBulkTariffC7 As Double
    Public WaterBulkTariffU8 As Double
    Public WaterBulkTariffC8 As Double
    
    
    Public WaterUnitTariffU1 As Double
    Public WaterUnitTariffC1 As Double
    Public WaterUnitTariffU2 As Double
    Public WaterUnitTariffC2 As Double
    Public WaterUnitTariffU3 As Double
    Public WaterUnitTariffC3 As Double
    Public WaterUnitTariffU4 As Double
    Public WaterUnitTariffC4 As Double
    Public WaterUnitTariffU5 As Double
    Public WaterUnitTariffC5 As Double
    Public WaterUnitTariffU6 As Double
    Public WaterUnitTariffC6 As Double
    Public WaterUnitTariffU7 As Double
    Public WaterUnitTariffC7 As Double
    Public WaterUnitTariffU8 As Double
    Public WaterUnitTariffC8 As Double


    '  Building History Variables ------------------------------------------------
    
    Public MonthBack1 As Date
    Public MonthBack2 As Date
    Public MonthBack3 As Date
    Public MonthBack4 As Date
    Public MonthBack5 As Date
    Public MonthBack6 As Date
    Public MonthBack7 As Date
    Public MonthBack8 As Date
    Public MonthBack9 As Date
    Public MonthBack10 As Date
    Public MonthBack11 As Date
    Public MonthBack12 As Date
    
    
    Public ElecBulkTotBack1 As Double
    Public ElecBulkTotBack2 As Double
    Public ElecBulkTotBack3 As Double
    Public ElecBulkTotBack4 As Double
    Public ElecBulkTotBack5 As Double
    Public ElecBulkTotBack6 As Double
    Public ElecBulkTotBack7 As Double
    Public ElecBulkTotBack8 As Double
    Public ElecBulkTotBack9 As Double
    Public ElecBulkTotBack10 As Double
    Public ElecBulkTotBack11 As Double
    Public ElecBulkTotBack12 As Double

    Public ElecUnitTotBack1 As Double
    Public ElecUnitTotBack2 As Double
    Public ElecUnitTotBack3 As Double
    Public ElecUnitTotBack4 As Double
    Public ElecUnitTotBack5 As Double
    Public ElecUnitTotBack6 As Double
    Public ElecUnitTotBack7 As Double
    Public ElecUnitTotBack8 As Double
    Public ElecUnitTotBack9 As Double
    Public ElecUnitTotBack10 As Double
    Public ElecUnitTotBack11 As Double
    Public ElecUnitTotBack12 As Double

    Public WaterBulkTotBack1 As Double
    Public WaterBulkTotBack2 As Double
    Public WaterBulkTotBack3 As Double
    Public WaterBulkTotBack4 As Double
    Public WaterBulkTotBack5 As Double
    Public WaterBulkTotBack6 As Double
    Public WaterBulkTotBack7 As Double
    Public WaterBulkTotBack8 As Double
    Public WaterBulkTotBack9 As Double
    Public WaterBulkTotBack10 As Double
    Public WaterBulkTotBack11 As Double
    Public WaterBulkTotBack12 As Double

    Public WaterUnitTotBack1 As Double
    Public WaterUnitTotBack2 As Double
    Public WaterUnitTotBack3 As Double
    Public WaterUnitTotBack4 As Double
    Public WaterUnitTotBack5 As Double
    Public WaterUnitTotBack6 As Double
    Public WaterUnitTotBack7 As Double
    Public WaterUnitTotBack8 As Double
    Public WaterUnitTotBack9 As Double
    Public WaterUnitTotBack10 As Double
    Public WaterUnitTotBack11 As Double
    Public WaterUnitTotBack12 As Double
    
  '  Global CodeCount As Integer
    
    Public ElecLiters(7) As Double
    Public ElecLitersUnits(7) As Double
    Public ElecCost(7) As Double
    
    Public WaterLiters(7) As Double
    Public WaterLitersUnits(7) As Double
    Public WaterCost(7) As Double
    
    Public SanLiters(7) As Double
    Public SanLitersUnits(7) As Double
    Public SanCost(7) As Double
    Public SanTot As Double
    Public StartTime As Double
    
