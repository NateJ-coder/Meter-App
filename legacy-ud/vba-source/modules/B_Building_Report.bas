Attribute VB_Name = "B_Building_Report"
 
Sub GenerateReport()
Attribute GenerateReport.VB_ProcData.VB_Invoke_Func = "R\n14"
      
    ThisSheet = ActiveSheet.Name
    
    If ThisSheet = "ReadableReport" Then GotoReadableReportTemplate: Exit Sub
    If ThisSheet = "BuildingReport" Then GotoBuildingReportTemplate: Exit Sub
   
    If ThisSheet = "ReadableReportTemplate" Then NewReport = "ReadableReport"
    
    If ThisSheet = "ElecBreakDown" Then NewReport = "BuildingReport"
    If ThisSheet = "BuildingReportTemplate" Then NewReport = "BuildingReport"
    
    ReportTemplate = NewReport & "ReadableReportTemplate"
    
    Application.DisplayAlerts = False
        DeleteSheet (NewReport)
    Application.DisplayAlerts = True
     
    Sheets(ReportTemplate).Visible = True
    Sheets(ReportTemplate).Copy Before:=Sheets(1)
    Sheets(ReportTemplate).Visible = False
    Sheets(ReportTemplate & " (2)").Name = NewReport

    Sheets(NewReport).Select
    Sheets(NewReport).Range("A1").Select
    
    PopulateThis
    
End Sub
'
'Sub Generate_Report()
'    FindReplace
' Exit Sub
'
'    On Error GoTo ErrorX
'
'    Application.DisplayAlerts = False
'        DeleteSheet ("BuildingReport")
'        DeleteSheet ("BuildingReportTemplate (2)")
'    Application.DisplayAlerts = True
'
'    Sheets("BuildingReportTemplate").Visible = True
'    Sheets("BuildingReportTemplate").Copy Before:=Sheets(1)
'    Sheets("BuildingReportTemplate (2)").Name = "BuildingReport"
'
'    Sheets("BuildingReport").Select
'    PopulateThis
'
'Exit Sub
'
'ErrorX:
'   MsgBox ("Error Ha ha ha ha!")
'
'
'End Sub

 
Sub PopulateThis()

 
    With ActiveSheet.Cells
        .Replace What:="BuildingName", Replacement:=BuildingName, LookAt:=xlPart, SearchOrder:=xlByRows, MatchCase:=False, SearchFormat:=False, ReplaceFormat:=False
        .Replace What:="SelDate", Replacement:=SelDate                      '  Number ofBulk Meters"
   
    ' ELECTRICITY
        .Replace What:="ElecBulkCount", Replacement:=ElecBulkCount          '  Number ofBulk Meters"
        .Replace What:="ElecBulkTotCon", Replacement:=ElecBulkTotCon        '  KWH Used by Bulk Meters"
        .Replace What:="ElecBulkTotCharge", Replacement:=ElecBulkTotCharge  '  Charge for KWH used by Bulk Meters"
        
        .Replace What:="ElecUnitCount", Replacement:=ElecUnitCount          '  Number of Unit Meters"
        .Replace What:="ElecUnitTotCon", Replacement:=ElecUnitTotCon        '  KWH Used by Unit Meters"
        .Replace What:="ElecUnitTotCharge", Replacement:=ElecUnitTotCharge  '  Charge for KWH used by Unit Meters"
        .Replace What:="ElecDifference", Replacement:=ElecDifference        '  Difference between Bulk and Units total"
         
         ' WATER
        .Replace What:="WaterBulkCount", Replacement:=WaterBulkCount        '  Number ofBulk Meters"
        .Replace What:="WaterBulkTotCon", Replacement:=WaterBulkTotCon      '  KL Used by Bulk Meters"
        .Replace What:="WaterBulkTotCharge", Replacement:=WaterBulkTotCharge   '  Charge for KL used by Bulk Meters"
        
        .Replace What:="WaterUnitCount", Replacement:=WaterUnitCount        '  Number of Unit Meters"
        .Replace What:="WaterUnitTotCon", Replacement:=WaterUnitTotCon      '  KL Used by Unit Meters"
        .Replace What:="WaterUnitTotCharge", Replacement:=WaterUnitTotCharge   '  Charge for KL used by Unit Meters"
        .Replace What:="WaterDifference", Replacement:=WaterDifference      '  Difference between Bulk and Units total"
 
    ' SERVICE PROVIDER CHARGES
        Dim ChargableUnits As Integer:    ChargableUnits = (ElecUnitCount - ExCount)
        Select Case OptionChoice1
               Case "PQ": OptionValue1 = "PQ Based"
               Case "Even": OptionValue1 = Format(OptionAmount1 / ChargableUnits, "0.00")
               Case "Fixed": OptionValue1 = OptionAmount1
               Case "None": OptionValue1 = 0
        End Select
        Select Case OptionChoice2
               Case "PQ": OptionValue2 = "PQ Based"
               Case "Even": OptionValue2 = Format(OptionAmount2 / ChargableUnits, "0.00")
               Case "Fixed": OptionValue2 = OptionAmount2
               Case "None": OptionValue2 = 0
        End Select
        Select Case OptionChoice3
               Case "PQ": OptionValue3 = "PQ Based"
               Case "Even": OptionValue3 = Format(OptionAmount3 / ChargableUnits, "0.00")
               Case "Fixed": OptionValue3 = OptionAmount3
               Case "None": OptionValue3 = 0
        End Select
        Select Case OptionChoice4
               Case "PQ": OptionValue4 = "PQ Based"
               Case "Even": OptionValue4 = Format(OptionAmount4 / ChargableUnits, "0.00")
               Case "Fixed": OptionValue4 = OptionAmount4
               Case "None": OptionValue4 = 0
        End Select
        Select Case OptionChoice5
               Case "PQ": OptionValue5 = "PQ Based"
               Case "Even": OptionValue5 = Format(OptionAmount5 / ChargableUnits, "0.00")
               Case "Fixed": OptionValue5 = OptionAmount5
               Case "None": OptionValue5 = 0
        End Select
        Select Case OptionChoice6
               Case "PQ": OptionValue6 = "PQ Based"
               Case "Even": OptionValue6 = Format(OptionAmount6 / ChargableUnits, "0.00")
               Case "Fixed": OptionValue6 = OptionAmount6
               Case "None": OptionValue6 = 0
        End Select
        Select Case OptionChoice7
               Case "PQ": OptionValue7 = "PQ Based"
               Case "Even": OptionValue7 = Format(OptionAmount7 / ChargableUnits, "0.00")
               Case "Fixed": OptionValue7 = OptionAmount7
               Case "None": OptionValue7 = 0
        End Select
        Select Case OptionChoice8
               Case "PQ": OptionValue8 = "PQ Based"
               Case "Even": OptionValue8 = Format(OptionAmount8 / ChargableUnits, "0.00")
               Case "Fixed": OptionValue8 = OptionAmount8
               Case "None": OptionValue8 = 0
        End Select
    
        .Replace What:="OptionText1", Replacement:=OptionText1
        .Replace What:="OptionAmount1", Replacement:=OptionAmount1
        .Replace What:="OptionChoice1", Replacement:=OptionChoice1
        .Replace What:="OptionValue1", Replacement:=OptionValue1
        
        .Replace What:="OptionText2", Replacement:=OptionText2
        .Replace What:="OptionAmount2", Replacement:=OptionAmount2
        .Replace What:="OptionChoice2", Replacement:=OptionChoice2
        .Replace What:="OptionValue2", Replacement:=OptionValue2
        
        .Replace What:="OptionText3", Replacement:=OptionText3
        .Replace What:="OptionAmount3", Replacement:=OptionAmount3
        .Replace What:="OptionChoice3", Replacement:=OptionChoice3
        .Replace What:="OptionValue3", Replacement:=OptionValue3
        
        .Replace What:="OptionText4", Replacement:=OptionText4
        .Replace What:="OptionAmount4", Replacement:=OptionAmount4
        .Replace What:="OptionChoice4", Replacement:=OptionChoice4
        .Replace What:="OptionValue4", Replacement:=OptionValue4
        
        .Replace What:="OptionText5", Replacement:=OptionText5
        .Replace What:="OptionAmount5", Replacement:=OptionAmount5
        .Replace What:="OptionChoice5", Replacement:=OptionChoice5
        .Replace What:="OptionValue5", Replacement:=OptionValue5
        
        .Replace What:="OptionText6", Replacement:=OptionText6
        .Replace What:="OptionAmount6", Replacement:=OptionAmount6
        .Replace What:="OptionChoice6", Replacement:=OptionChoice6
        .Replace What:="OptionValue6", Replacement:=OptionValue6
        
        .Replace What:="OptionText7", Replacement:=OptionText7
        .Replace What:="OptionAmount7", Replacement:=OptionAmount7
        .Replace What:="OptionChoice7", Replacement:=OptionChoice7
        .Replace What:="OptionValue7", Replacement:=OptionValue7
        
        .Replace What:="OptionText8", Replacement:=OptionText8
        .Replace What:="OptionAmount8", Replacement:=OptionAmount8
        .Replace What:="OptionChoice8", Replacement:=OptionChoice8
        .Replace What:="OptionValue8", Replacement:=OptionValue8

    
    ' ELECTRICITY TARIFF TABLE
        .Replace What:="ERange1", Replacement:=ERange1
        .Replace What:="ERange2", Replacement:=ERange2
        .Replace What:="ERange3", Replacement:=ERange3
        .Replace What:="ERange4", Replacement:=ERange4
        .Replace What:="ERange5", Replacement:=ERange5
        .Replace What:="ERange6", Replacement:=ERange6
        .Replace What:="ERange7", Replacement:=ERange7
        .Replace What:="ERange8", Replacement:=ERange8

        .Replace What:="ET1", Replacement:=ET1
        .Replace What:="ET2", Replacement:=ET2
        .Replace What:="ET3", Replacement:=ET3
        .Replace What:="ET4", Replacement:=ET4
        .Replace What:="ET5", Replacement:=ET5
        .Replace What:="ET6", Replacement:=ET6
        .Replace What:="ET7", Replacement:=ET7
        .Replace What:="ET8", Replacement:=ET8
        

        .Replace What:="ElecBulkTariffU1", Replacement:=ElecBulkTariffU1
        .Replace What:="ElecBulkTariffU2", Replacement:=ElecBulkTariffU2
        .Replace What:="ElecBulkTariffU3", Replacement:=ElecBulkTariffU3
        .Replace What:="ElecBulkTariffU4", Replacement:=ElecBulkTariffU4
        .Replace What:="ElecBulkTariffU5", Replacement:=ElecBulkTariffU5
        .Replace What:="ElecBulkTariffU6", Replacement:=ElecBulkTariffU6
        .Replace What:="ElecBulkTariffU7", Replacement:=ElecBulkTariffU7
        .Replace What:="ElecBulkTariffU8", Replacement:=ElecBulkTariffU8
         
        .Replace What:="ElecBulkTariffC1", Replacement:=ElecBulkTariffC1
        .Replace What:="ElecBulkTariffC2", Replacement:=ElecBulkTariffC2
        .Replace What:="ElecBulkTariffC3", Replacement:=ElecBulkTariffC3
        .Replace What:="ElecBulkTariffC4", Replacement:=ElecBulkTariffC4
        .Replace What:="ElecBulkTariffC5", Replacement:=ElecBulkTariffC5
        .Replace What:="ElecBulkTariffC6", Replacement:=ElecBulkTariffC6
        .Replace What:="ElecBulkTariffC7", Replacement:=ElecBulkTariffC7
        .Replace What:="ElecBulkTariffC8", Replacement:=ElecBulkTariffC8
         

        .Replace What:="ElecUnitTariffU1", Replacement:=ElecUnitTariffU1
        .Replace What:="ElecUnitTariffU2", Replacement:=ElecUnitTariffU2
        .Replace What:="ElecUnitTariffU3", Replacement:=ElecUnitTariffU3
        .Replace What:="ElecUnitTariffU4", Replacement:=ElecUnitTariffU4
        .Replace What:="ElecUnitTariffU5", Replacement:=ElecUnitTariffU5
        .Replace What:="ElecUnitTariffU6", Replacement:=ElecUnitTariffU6
        .Replace What:="ElecUnitTariffU7", Replacement:=ElecUnitTariffU7
        .Replace What:="ElecUnitTariffU8", Replacement:=ElecUnitTariffU8
         
        .Replace What:="ElecUnitTariffC1", Replacement:=ElecUnitTariffC1
        .Replace What:="ElecUnitTariffC2", Replacement:=ElecUnitTariffC2
        .Replace What:="ElecUnitTariffC3", Replacement:=ElecUnitTariffC3
        .Replace What:="ElecUnitTariffC4", Replacement:=ElecUnitTariffC4
        .Replace What:="ElecUnitTariffC5", Replacement:=ElecUnitTariffC5
        .Replace What:="ElecUnitTariffC6", Replacement:=ElecUnitTariffC6
        .Replace What:="ElecUnitTariffC7", Replacement:=ElecUnitTariffC7
        .Replace What:="ElecUnitTariffC8", Replacement:=ElecUnitTariffC8
         


    ' WATER TARIFF TABLE
        .Replace What:="WRange1", Replacement:=WRange1
        .Replace What:="WRange2", Replacement:=WRange2
        .Replace What:="WRange3", Replacement:=WRange3
        .Replace What:="WRange4", Replacement:=WRange4
        .Replace What:="WRange5", Replacement:=WRange5
        .Replace What:="WRange6", Replacement:=WRange6
        .Replace What:="WRange7", Replacement:=WRange7
        .Replace What:="WRange8", Replacement:=WRange8

        .Replace What:="WT1", Replacement:=WT1
        .Replace What:="WT2", Replacement:=WT2
        .Replace What:="WT3", Replacement:=WT3
        .Replace What:="WT4", Replacement:=WT4
        .Replace What:="WT5", Replacement:=WT5
        .Replace What:="WT6", Replacement:=WT6
        .Replace What:="WT7", Replacement:=WT7
        .Replace What:="WT8", Replacement:=WT8


        .Replace What:="WaterBulkTariffU1", Replacement:=WaterBulkTariffU1
        .Replace What:="WaterBulkTariffU2", Replacement:=WaterBulkTariffU2
        .Replace What:="WaterBulkTariffU3", Replacement:=WaterBulkTariffU3
        .Replace What:="WaterBulkTariffU4", Replacement:=WaterBulkTariffU4
        .Replace What:="WaterBulkTariffU5", Replacement:=WaterBulkTariffU5
        .Replace What:="WaterBulkTariffU6", Replacement:=WaterBulkTariffU6
        .Replace What:="WaterBulkTariffU7", Replacement:=WaterBulkTariffU7
        .Replace What:="WaterBulkTariffU8", Replacement:=WaterBulkTariffU8
         
        .Replace What:="WaterBulkTariffC1", Replacement:=WaterBulkTariffC1
        .Replace What:="WaterBulkTariffC2", Replacement:=WaterBulkTariffC2
        .Replace What:="WaterBulkTariffC3", Replacement:=WaterBulkTariffC3
        .Replace What:="WaterBulkTariffC4", Replacement:=WaterBulkTariffC4
        .Replace What:="WaterBulkTariffC5", Replacement:=WaterBulkTariffC5
        .Replace What:="WaterBulkTariffC6", Replacement:=WaterBulkTariffC6
        .Replace What:="WaterBulkTariffC7", Replacement:=WaterBulkTariffC7
        .Replace What:="WaterBulkTariffC8", Replacement:=WaterBulkTariffC8
         

        .Replace What:="WaterUnitTariffU1", Replacement:=WaterUnitTariffU1
        .Replace What:="WaterUnitTariffU2", Replacement:=WaterUnitTariffU2
        .Replace What:="WaterUnitTariffU3", Replacement:=WaterUnitTariffU3
        .Replace What:="WaterUnitTariffU4", Replacement:=WaterUnitTariffU4
        .Replace What:="WaterUnitTariffU5", Replacement:=WaterUnitTariffU5
        .Replace What:="WaterUnitTariffU6", Replacement:=WaterUnitTariffU6
        .Replace What:="WaterUnitTariffU7", Replacement:=WaterUnitTariffU7
        .Replace What:="WaterUnitTariffU8", Replacement:=WaterUnitTariffU8
         
        .Replace What:="WaterUnitTariffC1", Replacement:=WaterUnitTariffC1
        .Replace What:="WaterUnitTariffC2", Replacement:=WaterUnitTariffC2
        .Replace What:="WaterUnitTariffC3", Replacement:=WaterUnitTariffC3
        .Replace What:="WaterUnitTariffC4", Replacement:=WaterUnitTariffC4
        .Replace What:="WaterUnitTariffC5", Replacement:=WaterUnitTariffC5
        .Replace What:="WaterUnitTariffC6", Replacement:=WaterUnitTariffC6
        .Replace What:="WaterUnitTariffC7", Replacement:=WaterUnitTariffC7
        .Replace What:="WaterUnitTariffC8", Replacement:=WaterUnitTariffC8
         

    ' PREPAID ELECTRICITY
        .Replace What:="PPNoOfElecInstalled", Replacement:=PPNoOfElecInstalled
        .Replace What:="PPElecConvMeterTotal", Replacement:=PPElecConvMeterTotal
        .Replace What:="PPTotalElecCost", Replacement:=PPTotalElecCost
    
    ' PREPAID WATER
        .Replace What:="PPNoOfWaterInstalled", Replacement:=PPNoOfWaterInstalled
        .Replace What:="PPWaterConvMeterTotal", Replacement:=PPWaterConvMeterTotal
        .Replace What:="PPTotalWaterCost", Replacement:=PPTotalWaterCost
      
    '  BUILDING HISTORY TOTALS
    
        .Replace What:="MonthBack1", Replacement:=MonthBack1
        .Replace What:="MonthBack2", Replacement:=MonthBack2
        .Replace What:="MonthBack3", Replacement:=MonthBack3
        .Replace What:="MonthBack4", Replacement:=MonthBack4
        .Replace What:="MonthBack5", Replacement:=MonthBack5
        .Replace What:="MonthBack6", Replacement:=MonthBack6
        .Replace What:="MonthBack7", Replacement:=MonthBack7
        .Replace What:="MonthBack8", Replacement:=MonthBack8
        .Replace What:="MonthBack9", Replacement:=MonthBack9
        .Replace What:="MonthBack10", Replacement:=MonthBack10
        .Replace What:="MonthBack11", Replacement:=MonthBack11
        .Replace What:="MonthBack12", Replacement:=MonthBack12
    
        .Replace What:="ElecBulkTotBack1", Replacement:=ElecBulkTotBack1
        .Replace What:="ElecBulkTotBack2", Replacement:=ElecBulkTotBack2
        .Replace What:="ElecBulkTotBack3", Replacement:=ElecBulkTotBack3
        .Replace What:="ElecBulkTotBack4", Replacement:=ElecBulkTotBack4
        .Replace What:="ElecBulkTotBack5", Replacement:=ElecBulkTotBack5
        .Replace What:="ElecBulkTotBack6", Replacement:=ElecBulkTotBack6
        .Replace What:="ElecBulkTotBack7", Replacement:=ElecBulkTotBack7
        .Replace What:="ElecBulkTotBack8", Replacement:=ElecBulkTotBack8
        .Replace What:="ElecBulkTotBack9", Replacement:=ElecBulkTotBack9
        .Replace What:="ElecBulkTotBack10", Replacement:=ElecBulkTotBack10
        .Replace What:="ElecBulkTotBack11", Replacement:=ElecBulkTotBack11
        .Replace What:="ElecBulkTotBack12", Replacement:=ElecBulkTotBack12
    
        .Replace What:="ElecUnitTotBack1", Replacement:=ElecUnitTotBack1
        .Replace What:="ElecUnitTotBack2", Replacement:=ElecUnitTotBack2
        .Replace What:="ElecUnitTotBack3", Replacement:=ElecUnitTotBack3
        .Replace What:="ElecUnitTotBack4", Replacement:=ElecUnitTotBack4
        .Replace What:="ElecUnitTotBack5", Replacement:=ElecUnitTotBack5
        .Replace What:="ElecUnitTotBack6", Replacement:=ElecUnitTotBack6
        .Replace What:="ElecUnitTotBack7", Replacement:=ElecUnitTotBack7
        .Replace What:="ElecUnitTotBack8", Replacement:=ElecUnitTotBack8
        .Replace What:="ElecUnitTotBack9", Replacement:=ElecUnitTotBack9
        .Replace What:="ElecUnitTotBack10", Replacement:=ElecUnitTotBack10
        .Replace What:="ElecUnitTotBack11", Replacement:=ElecUnitTotBack11
        .Replace What:="ElecUnitTotBack12", Replacement:=ElecUnitTotBack12
    
      .Replace What:="WaterBulkTotBack1", Replacement:=WaterBulkTotBack1
        .Replace What:="WaterBulkTotBack2", Replacement:=WaterBulkTotBack2
        .Replace What:="WaterBulkTotBack3", Replacement:=WaterBulkTotBack3
        .Replace What:="WaterBulkTotBack4", Replacement:=WaterBulkTotBack4
        .Replace What:="WaterBulkTotBack5", Replacement:=WaterBulkTotBack5
        .Replace What:="WaterBulkTotBack6", Replacement:=WaterBulkTotBack6
        .Replace What:="WaterBulkTotBack7", Replacement:=WaterBulkTotBack7
        .Replace What:="WaterBulkTotBack8", Replacement:=WaterBulkTotBack8
        .Replace What:="WaterBulkTotBack9", Replacement:=WaterBulkTotBack9
        .Replace What:="WaterBulkTotBack10", Replacement:=WaterBulkTotBack10
        .Replace What:="WaterBulkTotBack11", Replacement:=WaterBulkTotBack11
        .Replace What:="WaterBulkTotBack12", Replacement:=WaterBulkTotBack12
    
        .Replace What:="WaterUnitTotBack1", Replacement:=WaterUnitTotBack1
        .Replace What:="WaterUnitTotBack2", Replacement:=WaterUnitTotBack2
        .Replace What:="WaterUnitTotBack3", Replacement:=WaterUnitTotBack3
        .Replace What:="WaterUnitTotBack4", Replacement:=WaterUnitTotBack4
        .Replace What:="WaterUnitTotBack5", Replacement:=WaterUnitTotBack5
        .Replace What:="WaterUnitTotBack6", Replacement:=WaterUnitTotBack6
        .Replace What:="WaterUnitTotBack7", Replacement:=WaterUnitTotBack7
        .Replace What:="WaterUnitTotBack8", Replacement:=WaterUnitTotBack8
        .Replace What:="WaterUnitTotBack9", Replacement:=WaterUnitTotBack9
        .Replace What:="WaterUnitTotBack10", Replacement:=WaterUnitTotBack10
        .Replace What:="WaterUnitTotBack11", Replacement:=WaterUnitTotBack11
        .Replace What:="WaterUnitTotBack12", Replacement:=WaterUnitTotBack12
    
 




    End With
    


End Sub

Sub GetHistoryData()

On Error Resume Next
        ThisRow = 1 ' Get Month Ref
        MonthBack1 = Sheets(LastBuilding).Cells(ThisRow, RemCol - 1)
        MonthBack2 = Sheets(LastBuilding).Cells(ThisRow, RemCol - 2)
        MonthBack3 = Sheets(LastBuilding).Cells(ThisRow, RemCol - 3)
        MonthBack4 = Sheets(LastBuilding).Cells(ThisRow, RemCol - 4)
        MonthBack5 = Sheets(LastBuilding).Cells(ThisRow, RemCol - 5)
        MonthBack6 = Sheets(LastBuilding).Cells(ThisRow, RemCol - 6)
        MonthBack7 = Sheets(LastBuilding).Cells(ThisRow, RemCol - 7)
        MonthBack8 = Sheets(LastBuilding).Cells(ThisRow, RemCol - 8)
        MonthBack9 = Sheets(LastBuilding).Cells(ThisRow, RemCol - 9)
        MonthBack10 = Sheets(LastBuilding).Cells(ThisRow, RemCol - 10)
        MonthBack11 = Sheets(LastBuilding).Cells(ThisRow, RemCol - 11)
        MonthBack12 = Sheets(LastBuilding).Cells(ThisRow, RemCol - 12)
    
    ThisRow = Sheets(LastBuilding).Columns(4).Find(What:="ElecBulkTotCon", LookAt:=xlWhole, MatchCase:=False).Row
        ElecBulkTotBack1 = Sheets(LastBuilding).Cells(ThisRow, RemCol - 1)
        ElecBulkTotBack2 = Sheets(LastBuilding).Cells(ThisRow, RemCol - 2)
        ElecBulkTotBack3 = Sheets(LastBuilding).Cells(ThisRow, RemCol - 3)
        ElecBulkTotBack4 = Sheets(LastBuilding).Cells(ThisRow, RemCol - 4)
        ElecBulkTotBack5 = Sheets(LastBuilding).Cells(ThisRow, RemCol - 5)
        ElecBulkTotBack6 = Sheets(LastBuilding).Cells(ThisRow, RemCol - 6)
        ElecBulkTotBack7 = Sheets(LastBuilding).Cells(ThisRow, RemCol - 7)
        ElecBulkTotBack8 = Sheets(LastBuilding).Cells(ThisRow, RemCol - 8)
        ElecBulkTotBack9 = Sheets(LastBuilding).Cells(ThisRow, RemCol - 9)
        ElecBulkTotBack10 = Sheets(LastBuilding).Cells(ThisRow, RemCol - 10)
        ElecBulkTotBack11 = Sheets(LastBuilding).Cells(ThisRow, RemCol - 11)
        ElecBulkTotBack12 = Sheets(LastBuilding).Cells(ThisRow, RemCol - 12)
    
    ThisRow = Sheets(LastBuilding).Columns(4).Find(What:="ElecUnitTotCon", LookAt:=xlWhole, MatchCase:=False).Row
        ElecUnitTotBack1 = Sheets(LastBuilding).Cells(ThisRow, RemCol - 1)
        ElecUnitTotBack2 = Sheets(LastBuilding).Cells(ThisRow, RemCol - 2)
        ElecUnitTotBack3 = Sheets(LastBuilding).Cells(ThisRow, RemCol - 3)
        ElecUnitTotBack4 = Sheets(LastBuilding).Cells(ThisRow, RemCol - 4)
        ElecUnitTotBack5 = Sheets(LastBuilding).Cells(ThisRow, RemCol - 5)
        ElecUnitTotBack6 = Sheets(LastBuilding).Cells(ThisRow, RemCol - 6)
        ElecUnitTotBack7 = Sheets(LastBuilding).Cells(ThisRow, RemCol - 7)
        ElecUnitTotBack8 = Sheets(LastBuilding).Cells(ThisRow, RemCol - 8)
        ElecUnitTotBack9 = Sheets(LastBuilding).Cells(ThisRow, RemCol - 9)
        ElecUnitTotBack10 = Sheets(LastBuilding).Cells(ThisRow, RemCol - 10)
        ElecUnitTotBack11 = Sheets(LastBuilding).Cells(ThisRow, RemCol - 11)
        ElecUnitTotBack12 = Sheets(LastBuilding).Cells(ThisRow, RemCol - 12)


    ThisRow = Sheets(LastBuilding).Columns(4).Find(What:="WaterBulkTotCon", LookAt:=xlWhole, MatchCase:=False).Row
        WaterBulkTotBack1 = Sheets(LastBuilding).Cells(ThisRow, RemCol - 1)
        WaterBulkTotBack2 = Sheets(LastBuilding).Cells(ThisRow, RemCol - 2)
        WaterBulkTotBack3 = Sheets(LastBuilding).Cells(ThisRow, RemCol - 3)
        WaterBulkTotBack4 = Sheets(LastBuilding).Cells(ThisRow, RemCol - 4)
        WaterBulkTotBack5 = Sheets(LastBuilding).Cells(ThisRow, RemCol - 5)
        WaterBulkTotBack6 = Sheets(LastBuilding).Cells(ThisRow, RemCol - 6)
        WaterBulkTotBack7 = Sheets(LastBuilding).Cells(ThisRow, RemCol - 7)
        WaterBulkTotBack8 = Sheets(LastBuilding).Cells(ThisRow, RemCol - 8)
        WaterBulkTotBack9 = Sheets(LastBuilding).Cells(ThisRow, RemCol - 9)
        WaterBulkTotBack10 = Sheets(LastBuilding).Cells(ThisRow, RemCol - 10)
        WaterBulkTotBack11 = Sheets(LastBuilding).Cells(ThisRow, RemCol - 11)
        WaterBulkTotBack12 = Sheets(LastBuilding).Cells(ThisRow, RemCol - 12)
    
    ThisRow = Sheets(LastBuilding).Columns(4).Find(What:="WaterUnitTotCon", LookAt:=xlWhole, MatchCase:=False).Row
        WaterUnitTotBack1 = Sheets(LastBuilding).Cells(ThisRow, RemCol - 1)
        WaterUnitTotBack2 = Sheets(LastBuilding).Cells(ThisRow, RemCol - 2)
        WaterUnitTotBack3 = Sheets(LastBuilding).Cells(ThisRow, RemCol - 3)
        WaterUnitTotBack4 = Sheets(LastBuilding).Cells(ThisRow, RemCol - 4)
        WaterUnitTotBack5 = Sheets(LastBuilding).Cells(ThisRow, RemCol - 5)
        WaterUnitTotBack6 = Sheets(LastBuilding).Cells(ThisRow, RemCol - 6)
        WaterUnitTotBack7 = Sheets(LastBuilding).Cells(ThisRow, RemCol - 7)
        WaterUnitTotBack8 = Sheets(LastBuilding).Cells(ThisRow, RemCol - 8)
        WaterUnitTotBack9 = Sheets(LastBuilding).Cells(ThisRow, RemCol - 9)
        WaterUnitTotBack10 = Sheets(LastBuilding).Cells(ThisRow, RemCol - 10)
        WaterUnitTotBack11 = Sheets(LastBuilding).Cells(ThisRow, RemCol - 11)
        WaterUnitTotBack12 = Sheets(LastBuilding).Cells(ThisRow, RemCol - 12)


End Sub

Sub UpdateMonthlyCals()
          
        Ans = UpdateStat("ElecBulkCount", ElecBulkCount)
        Ans = UpdateStat("ElecBulkTotCon", ElecBulkTotCon)
        Ans = UpdateStat("ElecBulkTotCharge", ElecBulkTotCharge)
        Ans = UpdateStat("ElecUnitCount", ElecUnitCount)
        Ans = UpdateStat("ElecUnitTotCon", ElecUnitTotCon)
        Ans = UpdateStat("ElecUnitTotCharge", ElecUnitTotCharge)
        Ans = UpdateStat("ElecDifference", ElecDifference)
        
        Ans = UpdateStat("WaterBulkCount", WaterBulkCount)
        Ans = UpdateStat("WaterBulkTotCon", WaterBulkTotCon)
        Ans = UpdateStat("WaterBulkTotCharge", WaterBulkTotCharge)
        Ans = UpdateStat("WaterUnitCount", WaterUnitCount)
        Ans = UpdateStat("WaterUnitTotCon", WaterUnitTotCon)
        Ans = UpdateStat("WaterUnitTotCharge", WaterUnitTotCharge)
        Ans = UpdateStat("WaterDifference", WaterDifference)
        
        Ans = UpdateStat("PPNoOfElecInstalled", PPNoOfElecInstalled)
        Ans = UpdateStat("PPElecConvMeterTotal", PPElecConvMeterTotal)
        Ans = UpdateStat("PPTotalElecCost", PPTotalElecCost)
        Ans = UpdateStat("PPNoOfWaterInstalled", PPNoOfWaterInstalled)
        Ans = UpdateStat("PPWaterConvMeterTotal", PPWaterConvMeterTotal)
        Ans = UpdateStat("PPTotalWaterCost", PPTotalWaterCost)

    GetHistoryData

End Sub

Function UpdateStat(VariableName As String, VariableValue As Double)
    ThisRow = Sheets(LastBuilding).Columns(4).Find(What:=VariableName, LookAt:=xlWhole, MatchCase:=False).Row
    If ThisRow > 0 Then Sheets(LastBuilding).Cells(ThisRow, RemCol) = VariableValue
End Function
